import type { LlmProviderName } from '@scc/shared';

/**
 * Our own AI interface (CLAUDE.md, Tech). Agent code only talks to this,
 * so Gemini, Groq and the FakeLlmProvider can be swapped.
 */

/** A tool the model may call, described with a JSON schema. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type LlmMessage =
  | { role: 'user'; text: string }
  | {
      role: 'assistant';
      text: string | null;
      toolCalls: ToolCall[];
      /** Raw provider content that must be sent back unchanged (e.g. Gemini thought signatures). */
      providerData?: unknown;
    }
  | { role: 'tool'; toolCallId: string; name: string; result: unknown };

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: ToolDefinition[];
}

export interface LlmResponse {
  text: string | null;
  toolCalls: ToolCall[];
  providerData?: unknown;
}

export abstract class LlmProvider {
  /** "fake" only for local development and tests. */
  abstract readonly name: LlmProviderName | 'fake';
  abstract complete(request: LlmRequest): Promise<LlmResponse>;
}

/** Thrown when the provider is out of quota or unreachable; the agent retries. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
