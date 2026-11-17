import { randomUUID } from 'node:crypto';
import type {
  AgentRunRequest,
  AgentStep,
  AgentStepKind,
  Evidence,
  EvidenceGap,
  EvidenceTopic,
  SourceSystem,
} from '@scc/shared';
import { LlmProviderError, type LlmMessage, type LlmProvider } from '../llm/llm-provider.js';
import type { DemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { AGENT_TOOLS, SUBMIT_TOOL, runDataTool } from './agent-tools.js';
import { SYSTEM_PROMPT, taskMessage } from './system-prompt.js';

/** Fixed limits (PLAN.md, section 4: steps, time limit and retries). */
export interface AgentLimits {
  maxModelTurns: number;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxModelTurns: 10,
  timeoutMs: 120_000,
  retries: 2,
  retryDelayMs: 2_000,
};

export interface AgentResult {
  evidence: Evidence[];
  gaps: EvidenceGap[];
}

const TOPICS: EvidenceTopic[] = ['quality', 'price', 'co2', 'delivery', 'compliance', 'leadTime'];
const SYSTEM_BY_PREFIX: [string, SourceSystem][] = [
  ['ERP-', 'erp'],
  ['RAT-', 'ratings'],
  ['PCF-', 'pcf'],
  ['DOC-', 'documents'],
];

export class AgentTimeoutError extends Error {}

/**
 * One agent run: the model calls tools until it submits its evidence.
 * Every step is reported through onStep, so the cockpit can show progress.
 */
export class AgentRunner {
  private steps = 0;

  constructor(
    private readonly llm: LlmProvider,
    private readonly data: DemoDataRepository,
    private readonly onStep: (step: AgentStep) => void,
    private readonly limits: AgentLimits = DEFAULT_LIMITS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(request: AgentRunRequest): Promise<AgentResult> {
    const deadline = this.now().getTime() + this.limits.timeoutMs;
    const messages: LlmMessage[] = [{ role: 'user', text: taskMessage(request) }];
    /** recordId -> when the code retrieved it. */
    const retrieved = new Map<string, { system: SourceSystem; at: string }>();

    for (let turn = 1; turn <= this.limits.maxModelTurns; turn++) {
      const response = await this.completeWithRetries(messages, deadline);
      messages.push({
        role: 'assistant',
        text: response.text,
        toolCalls: response.toolCalls,
        providerData: response.providerData,
      });
      this.log('model', response.toolCalls.length > 0
        ? `Model asks for ${response.toolCalls.map((c) => c.name).join(', ')}`
        : 'Model answered without a tool call');

      if (response.toolCalls.length === 0) {
        messages.push({ role: 'user', text: `Continue with the tools and end with ${SUBMIT_TOOL}.` });
        continue;
      }

      for (const call of response.toolCalls) {
        if (call.name === SUBMIT_TOOL) {
          this.log('tool_call', 'Agent submits its evidence', call.name);
          const result = toResult(call.args, request, retrieved);
          this.log('tool_result', `${result.evidence.length} pieces of evidence, ${result.gaps.length} gaps`, call.name);
          return result;
        }
        this.log('tool_call', `${call.name}(${describe(call.args)})`, call.name, call.args);
        const outcome = runDataTool(this.data, call.name, call.args);
        const at = this.now().toISOString();
        for (const r of outcome.retrieved) retrieved.set(r.recordId, { system: r.system, at });
        const failed = typeof outcome.result === 'object' && outcome.result !== null && 'error' in outcome.result;
        this.log('tool_result', failed ? `${call.name}: ${(outcome.result as { error: string }).error}` : `${call.name}: received`, call.name);
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, result: outcome.result });
      }
    }
    throw new Error(`Step limit reached: no evidence after ${this.limits.maxModelTurns} model turns`);
  }

  private async completeWithRetries(messages: LlmMessage[], deadline: number) {
    for (let attempt = 0; ; attempt++) {
      const left = deadline - this.now().getTime();
      if (left <= 0) throw new AgentTimeoutError(`Time limit of ${this.limits.timeoutMs / 1000} s reached`);
      try {
        return await withTimeout(
          this.llm.complete({ system: SYSTEM_PROMPT, messages, tools: AGENT_TOOLS }),
          left,
          this.limits.timeoutMs,
        );
      } catch (error) {
        const retryable = error instanceof LlmProviderError && error.retryable;
        if (!retryable || attempt >= this.limits.retries) throw error;
        this.log('retry', `Retry ${attempt + 1} of ${this.limits.retries}: ${error.message}`);
        await new Promise((r) => setTimeout(r, this.limits.retryDelayMs * (attempt + 1)));
      }
    }
  }

  private log(kind: AgentStepKind, summary: string, tool?: string, input?: Record<string, unknown>) {
    this.steps += 1;
    this.onStep({ index: this.steps, at: this.now().toISOString(), kind, summary, tool, input });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, totalMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AgentTimeoutError(`Time limit of ${totalMs / 1000} s reached`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Strings and numbers as text; anything else (objects, null) as empty text. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function describe(args: Record<string, unknown>): string {
  return Object.values(args).map(String).join(', ');
}

/** Turns the agent's submission into evidence. The code, not the AI, sets system and retrieval time. */
function toResult(
  args: Record<string, unknown>,
  request: AgentRunRequest,
  retrieved: Map<string, { system: SourceSystem; at: string }>,
): AgentResult {
  const evidence: Evidence[] = [];
  const gaps: EvidenceGap[] = [];
  const items = Array.isArray(args['evidence']) ? (args['evidence'] as Record<string, unknown>[]) : [];
  const gapItems = Array.isArray(args['gaps']) ? (args['gaps'] as Record<string, unknown>[]) : [];

  for (const item of items) {
    const supplierId = asText(item['supplierId']);
    const topic = item['topic'] as EvidenceTopic;
    const recordId = asText(item['recordId']);
    const reject = (reason: string) => {
      if (request.supplierIds.includes(supplierId) && TOPICS.includes(topic)) {
        gaps.push({ supplierId, topic, reason: `Agent evidence rejected: ${reason}` });
      }
    };
    if (!request.supplierIds.includes(supplierId)) continue;
    if (!TOPICS.includes(topic)) continue;

    const rawValue = item['value'];
    let value: number | string;
    if (topic === 'compliance') {
      value = asText(rawValue);
    } else {
      value = typeof rawValue === 'number' ? rawValue : Number(asText(rawValue).replace(/,/g, ''));
      if (!Number.isFinite(value)) {
        reject(`value "${asText(rawValue)}" is not a number`);
        continue;
      }
    }

    const field = typeof item['field'] === 'string' ? item['field'] : null;
    const page = typeof item['page'] === 'number' ? item['page'] : Number(item['page']);
    const quote = typeof item['quote'] === 'string' ? item['quote'] : null;
    let location: Evidence['location'];
    if (quote && Number.isInteger(page) && page > 0) {
      location = { kind: 'document', page, quote };
    } else if (field) {
      location = { kind: 'field', field };
    } else {
      reject('no field or page and quote given');
      continue;
    }

    const source = retrieved.get(recordId);
    const system = source?.system ?? SYSTEM_BY_PREFIX.find(([prefix]) => recordId.startsWith(prefix))?.[1];
    if (!system) {
      reject(`unknown source ${recordId}`);
      continue;
    }

    evidence.push({
      evidenceId: randomUUID(),
      supplierId,
      topic,
      value,
      unit: asText(item['unit']),
      sentence: asText(item['sentence']),
      system,
      recordId,
      location,
      retrievedAt: source?.at ?? null,
      status: 'unchecked',
      checkFailures: [],
      sourceDocumentType: null,
      sourceDate: null,
      sourceBadge: null,
    });
  }

  for (const gap of gapItems) {
    const supplierId = asText(gap['supplierId']);
    const topic = gap['topic'] as EvidenceTopic;
    if (request.supplierIds.includes(supplierId) && TOPICS.includes(topic)) {
      gaps.push({ supplierId, topic, reason: asText(gap['reason']) });
    }
  }
  return { evidence, gaps };
}
