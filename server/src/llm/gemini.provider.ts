import { randomUUID } from 'node:crypto';
import {
  LlmProvider,
  LlmProviderError,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type ToolCall,
} from './llm-provider.js';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
  thought?: boolean;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiOptions {
  apiKey: string;
  /** Default gemini-3.5-flash (free tier; 2.5-flash was retired for new keys and 3.8-flash was often overloaded, 16 Nov 2026). Check the current list on ai.google.dev. */
  model?: string;
  fetchFn?: typeof fetch;
}

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini via its REST API, with function calling. */
export class GeminiProvider extends LlmProvider {
  readonly name = 'gemini' as const;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: GeminiOptions) {
    super();
    this.model = options.model ?? 'gemini-3.5-flash';
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: toGeminiContents(request.messages),
      tools: [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ],
      generationConfig: { temperature: 0 },
    };

    let res: Response;
    try {
      res = await this.fetchFn(`${API}/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new LlmProviderError(`Gemini not reachable: ${String(error)}`, true);
    }

    if (!res.ok) {
      // 429 = quota or rate limit, 5xx = outage: worth retrying or switching provider.
      const retryable = res.status === 429 || res.status >= 500;
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new LlmProviderError(`Gemini answered ${res.status}: ${detail}`, retryable);
    }

    const json = (await res.json()) as { candidates?: { content?: GeminiContent }[] };
    const content = json.candidates?.[0]?.content;
    if (!content) {
      throw new LlmProviderError('Gemini returned no answer', true);
    }
    return fromGeminiContent(content);
  }
}

export function toGeminiContents(messages: LlmMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: message.text }] });
    } else if (message.role === 'assistant') {
      // Send Gemini's own parts back unchanged, so thought signatures survive.
      const raw = message.providerData as GeminiContent | undefined;
      if (raw?.role === 'model') {
        contents.push(raw);
        continue;
      }
      const parts: GeminiPart[] = [];
      if (message.text) parts.push({ text: message.text });
      for (const call of message.toolCalls) {
        parts.push({ functionCall: { name: call.name, args: call.args } });
      }
      contents.push({ role: 'model', parts });
    } else {
      const part: GeminiPart = {
        functionResponse: { name: message.name, response: { result: message.result } },
      };
      // Answers to parallel calls belong in one user turn.
      const last = contents.at(-1);
      if (last?.role === 'user' && last.parts.every((p) => p.functionResponse)) {
        last.parts.push(part);
      } else {
        contents.push({ role: 'user', parts: [part] });
      }
    }
  }
  return contents;
}

export function fromGeminiContent(content: GeminiContent): LlmResponse {
  const toolCalls: ToolCall[] = [];
  const texts: string[] = [];
  for (const part of content.parts ?? []) {
    if (part.functionCall) {
      toolCalls.push({ id: randomUUID(), name: part.functionCall.name, args: part.functionCall.args ?? {} });
    } else if (part.text && !part.thought) {
      texts.push(part.text);
    }
  }
  return {
    text: texts.length > 0 ? texts.join('\n') : null,
    toolCalls,
    providerData: { role: 'model', parts: content.parts ?? [] },
  };
}
