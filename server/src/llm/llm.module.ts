import { Module } from '@nestjs/common';
import { FakeLlmProvider } from './fake-llm.provider.js';
import { GeminiProvider } from './gemini.provider.js';
import { LlmProvider } from './llm-provider.js';

/**
 * Picks the AI provider from LLM_PROVIDER (default "fake").
 * The FakeLlmProvider is refused in production, so it can never deliver the demo.
 */
export function createLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const name = env.LLM_PROVIDER ?? 'fake';
  if (name === 'fake') {
    if (env.NODE_ENV === 'production') {
      throw new Error('FakeLlmProvider is switched off in production. Set LLM_PROVIDER=gemini.');
    }
    return new FakeLlmProvider();
  }
  if (name === 'gemini') {
    if (!env.GEMINI_API_KEY) {
      throw new Error('LLM_PROVIDER=gemini needs GEMINI_API_KEY in the .env');
    }
    return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined });
  }
  throw new Error(`Unknown LLM_PROVIDER "${name}". Use fake or gemini.`);
}

@Module({
  providers: [{ provide: LlmProvider, useFactory: () => createLlmProvider() }],
  exports: [LlmProvider],
})
export class LlmModule {}
