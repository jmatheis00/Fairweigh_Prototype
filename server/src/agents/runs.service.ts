import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AgentRun, AgentRunRequest, RunMode } from '@scc/shared';
import { LlmProvider } from '../llm/llm-provider.js';
import { checkEvidence } from '../evidence/evidence-check.js';
import { DemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { AgentRunner, DEFAULT_LIMITS, type AgentLimits } from './agent-runner.js';

/** The fields of the request form; all optional. */
export interface PurchaseRequestForm {
  partId?: string;
  quantity?: number;
  neededBy?: string | null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Folder for saved real runs (fallback for the demo). Override with RUNS_DIR. */
export function defaultRunsDir(): string {
  return process.env.RUNS_DIR ?? resolve(process.cwd(), '../data/runs');
}

/** Live runs allowed per day (UTC), to protect the free quota. Override with DAILY_RUN_LIMIT. */
export function defaultDailyLimit(): number {
  const value = Number(process.env.DAILY_RUN_LIMIT ?? 20);
  return Number.isInteger(value) && value >= 0 ? value : 20;
}

export interface RunUsage {
  liveRunsToday: number;
  dailyLimit: number;
}

/** Agent limits; tests replace them with short ones. */
export const AGENT_LIMITS = Symbol('AGENT_LIMITS');

/**
 * Runs the agent as a background job and keeps runs in memory
 * (no database for now, PLAN.md section 6). Real runs are also saved as JSON.
 */
@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);
  private readonly runs = new Map<string, AgentRun>();
  private readonly finished = new Map<string, Promise<void>>();

  constructor(
    private readonly llm: LlmProvider,
    private readonly data: DemoDataRepository,
    private readonly limits: AgentLimits = DEFAULT_LIMITS,
    private readonly runsDir: string = defaultRunsDir(),
    private readonly dailyLimit: number = defaultDailyLimit(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Live runs started today (UTC). Test-mode runs do not count. */
  usage(): RunUsage {
    const today = this.now().toISOString().slice(0, 10);
    const liveRunsToday = [...this.runs.values()].filter(
      (r) => r.mode.kind === 'live' && r.startedAt.startsWith(today),
    ).length;
    return { liveRunsToday, dailyLimit: this.dailyLimit };
  }

  mode(): RunMode {
    return this.llm.name === 'fake' ? { kind: 'fake' } : { kind: 'live', provider: this.llm.name };
  }

  /**
   * Turns the request form into an agent request. The agent checks all
   * offers for the selected part. Missing fields get the defaults.
   */
  buildRequest(form: PurchaseRequestForm = {}): AgentRunRequest {
    const settings = this.data.getSettings();
    const partId = form.partId ?? settings.catalog.find((p) => p.hasOffers)?.partId;
    const part = settings.catalog.find((p) => p.partId === partId);
    if (!part) throw new BadRequestException(`Unknown product ${String(partId)}`);
    if (!part.hasOffers) throw new BadRequestException(`No offers for ${part.partName} in this demo`);

    const quantity = form.quantity ?? part.defaultQuantity ?? settings.defaultQuantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000_000) {
      throw new BadRequestException('Quantity must be a whole number between 1 and 10,000,000');
    }

    const neededBy = form.neededBy ?? null;
    if (neededBy !== null && !isIsoDate(neededBy)) {
      throw new BadRequestException('Needed-by date must be a date in the form YYYY-MM-DD');
    }

    const supplierIds = this.data.listOffers().filter((o) => o.partId === part.partId).map((o) => o.supplierId);
    return { partId: part.partId, supplierIds, quantity, neededBy };
  }

  /** Starts a run and returns at once; the run continues in the background. */
  start(request: AgentRunRequest = this.buildRequest()): AgentRun {
    if ([...this.runs.values()].some((r) => r.status === 'running')) {
      throw new ConflictException('A run is already in progress');
    }
    if (this.mode().kind === 'live') {
      const { liveRunsToday, dailyLimit } = this.usage();
      if (liveRunsToday >= dailyLimit) {
        throw new HttpException(
          `Daily limit of ${dailyLimit} live runs reached. Please try again tomorrow.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const run: AgentRun = {
      runId: randomUUID(),
      request,
      mode: this.mode(),
      status: 'running',
      startedAt: this.now().toISOString(),
      finishedAt: null,
      steps: [],
      evidence: [],
      gaps: [],
      error: null,
    };
    this.runs.set(run.runId, run);
    this.finished.set(run.runId, this.execute(run));
    return run;
  }

  get(runId: string): AgentRun {
    const run = this.runs.get(runId);
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return run;
  }

  list(): AgentRun[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * The latest saved real run (fallback for the demo, PLAN.md section 4).
   * Only completed runs of a real provider count; anything else in the
   * folder is ignored, so a test-mode run can never become the fallback.
   * The run is marked "saved" with its date for the mode indicator.
   * With a part ID, only runs for that product count.
   */
  async latestSaved(partId?: string): Promise<AgentRun | null> {
    const names = await readdir(this.runsDir).catch(() => [] as string[]);
    const runs: AgentRun[] = [];
    for (const name of names.filter((n) => n.endsWith('.json'))) {
      try {
        const run = JSON.parse(await readFile(join(this.runsDir, name), 'utf8')) as AgentRun;
        if (
          run.mode?.kind === 'live' &&
          run.status === 'completed' &&
          Array.isArray(run.evidence) &&
          typeof run.startedAt === 'string' &&
          (partId === undefined || run.request?.partId === partId)
        ) {
          runs.push(run);
        }
      } catch {
        this.logger.warn(`Skipping unreadable saved run ${name}`);
      }
    }
    const latest = runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    return latest ? { ...latest, mode: { kind: 'saved', runDate: latest.startedAt.slice(0, 10) } } : null;
  }

  /** For tests: wait until a run has finished. */
  async waitFor(runId: string): Promise<AgentRun> {
    await this.finished.get(runId);
    return this.get(runId);
  }

  private async execute(run: AgentRun): Promise<void> {
    const runner = new AgentRunner(this.llm, this.data, (step) => run.steps.push(step), this.limits);
    try {
      const result = await runner.run(run.request);
      // The code checks every piece of evidence before anyone sees it.
      run.evidence = checkEvidence(result.evidence, this.data, run.request);
      const rejected = run.evidence.filter((e) => e.status === 'not_verified').length;
      run.steps.push({
        index: run.steps.length + 1,
        at: new Date().toISOString(),
        kind: 'check',
        summary: `Evidence check: ${run.evidence.length - rejected} verified, ${rejected} not verified`,
      });
      run.gaps = result.gaps;
      run.status = 'completed';
    } catch (error) {
      run.status = 'failed';
      run.error = error instanceof Error ? error.message : String(error);
      run.steps.push({ index: run.steps.length + 1, at: new Date().toISOString(), kind: 'error', summary: run.error });
    }
    run.finishedAt = new Date().toISOString();
    await this.save(run);
  }

  /** Only real runs are saved: a fake run must never become the demo fallback. */
  private async save(run: AgentRun): Promise<void> {
    if (run.mode.kind !== 'live' || run.status !== 'completed') return;
    try {
      await mkdir(this.runsDir, { recursive: true });
      const name = `${run.startedAt.replace(/[:.]/g, '-')}_${run.mode.provider}.json`;
      await writeFile(join(this.runsDir, name), `${JSON.stringify(run, null, 2)}\n`);
    } catch (error) {
      this.logger.error(`Could not save run ${run.runId}: ${String(error)}`);
    }
  }
}
