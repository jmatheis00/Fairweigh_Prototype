import { GeminiProvider, toGeminiContents } from './gemini.provider.js';
import { LlmProviderError } from './llm-provider.js';

const request = {
  system: 'sys',
  messages: [{ role: 'user' as const, text: 'task' }],
  tools: [{ name: 'get_rating', description: 'd', parameters: { type: 'object' } }],
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('GeminiProvider', () => {
  it('sends tools and the key in the header, and reads function calls', async () => {
    const { fn, calls } = fakeFetch(200, {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'get_rating', args: { supplierId: 'S-0013' } }, thoughtSignature: 'sig' }],
          },
        },
      ],
    });
    const response = await new GeminiProvider({ apiKey: 'test-key', fetchFn: fn }).complete(request);

    const [call] = calls;
    if (!call) throw new Error('fetch was not called');
    expect(call.url).toContain('/models/gemini-3.5-flash:generateContent');
    expect((call.init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(call.url).not.toContain('test-key');
    const body = JSON.parse(call.init.body as string) as { tools: { functionDeclarations: { name: string }[] }[] };
    expect(body.tools[0]?.functionDeclarations[0]?.name).toBe('get_rating');
    expect(response.toolCalls[0]).toMatchObject({ name: 'get_rating', args: { supplierId: 'S-0013' } });
  });

  it('sends Gemini parts back unchanged, so thought signatures survive', async () => {
    const { fn } = fakeFetch(200, {
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'get_rating', args: {} }, thoughtSignature: 'sig' }] } }],
    });
    const response = await new GeminiProvider({ apiKey: 'k', fetchFn: fn }).complete(request);
    const contents = toGeminiContents([
      { role: 'user', text: 'task' },
      { role: 'assistant', text: null, toolCalls: response.toolCalls, providerData: response.providerData },
      { role: 'tool', toolCallId: '1', name: 'get_rating', result: { a: 1 } },
      { role: 'tool', toolCallId: '2', name: 'get_rating', result: { b: 2 } },
    ]);
    expect(contents[1]?.parts[0]?.thoughtSignature).toBe('sig');
    expect(contents).toHaveLength(3);
    expect(contents[2]?.parts).toHaveLength(2);
  });

  it('marks quota errors as retryable and bad requests as permanent', async () => {
    const quota = new GeminiProvider({ apiKey: 'k', fetchFn: fakeFetch(429, {}).fn });
    await expect(quota.complete(request)).rejects.toMatchObject({ retryable: true });
    const bad = new GeminiProvider({ apiKey: 'k', fetchFn: fakeFetch(400, {}).fn });
    await expect(bad.complete(request)).rejects.toBeInstanceOf(LlmProviderError);
    await expect(bad.complete(request)).rejects.toMatchObject({ retryable: false });
  });
});
