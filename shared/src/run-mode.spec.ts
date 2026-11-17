import { describe, expect, it } from 'vitest';
import { runModeLabel } from './run-mode.js';

describe('runModeLabel', () => {
  it('names the provider for a live run', () => {
    expect(runModeLabel({ kind: 'live', provider: 'gemini' })).toBe('Live: Gemini');
    expect(runModeLabel({ kind: 'live', provider: 'groq' })).toBe('Live: Groq');
  });

  it('names the date for a saved run', () => {
    expect(runModeLabel({ kind: 'saved', runDate: '2026-11-18' })).toBe(
      'Saved run from 18 Nov 2026',
    );
  });

  it('marks example decisions as fictitious and without AI', () => {
    expect(runModeLabel({ kind: 'example' })).toBe('Example, fictitious: built from the demo data, no AI run');
  });

  it('marks test mode unambiguously', () => {
    expect(runModeLabel({ kind: 'fake' })).toContain('no real AI run');
  });

  it('rejects an invalid date', () => {
    expect(() => runModeLabel({ kind: 'saved', runDate: '18.11.2026' })).toThrow();
    expect(() => runModeLabel({ kind: 'saved', runDate: '2026-13-01' })).toThrow();
  });
});
