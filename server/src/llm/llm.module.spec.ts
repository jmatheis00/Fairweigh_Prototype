import { createLlmProvider } from './llm.module.js';

describe('createLlmProvider', () => {
  it('uses the FakeLlmProvider by default during development', () => {
    expect(createLlmProvider({}).name).toBe('fake');
  });

  it('refuses the FakeLlmProvider in production', () => {
    expect(() => createLlmProvider({ NODE_ENV: 'production' })).toThrow('switched off in production');
  });

  it('needs an API key for Gemini', () => {
    expect(() => createLlmProvider({ LLM_PROVIDER: 'gemini' })).toThrow('GEMINI_API_KEY');
    expect(createLlmProvider({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).name).toBe('gemini');
  });

  it('rejects unknown providers', () => {
    expect(() => createLlmProvider({ LLM_PROVIDER: 'other' })).toThrow('Unknown');
  });
});
