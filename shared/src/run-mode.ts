/**
 * Where the displayed evidence comes from. The app always shows the mode
 * visibly (CLAUDE.md, section Tech).
 * - live:  real run with an AI provider
 * - saved: stored run from a real provider, used as fallback
 * - fake:  fixed test answers, only locally and in automated tests
 * - example: example decisions in the log, built by code from the demo data
 */
export type LlmProviderName = 'gemini' | 'groq';

export type RunMode =
  | { kind: 'live'; provider: LlmProviderName }
  | { kind: 'saved'; runDate: string }
  | { kind: 'fake' }
  /** Example decisions in the log, built by code from the demo data (no AI run). */
  | { kind: 'example' };

const PROVIDER_LABEL: Record<LlmProviderName, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats an ISO date (YYYY-MM-DD) as e.g. "18 Nov 2026". */
function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  return `${Number(day)} ${monthName} ${year}`;
}

/** Text for the mode indicator, e.g. "Live: Gemini". */
export function runModeLabel(mode: RunMode): string {
  switch (mode.kind) {
    case 'live':
      return `Live: ${PROVIDER_LABEL[mode.provider]}`;
    case 'saved':
      return `Saved run from ${formatDate(mode.runDate)}`;
    case 'fake':
      return 'Test mode: fixed answers, no real AI run';
    case 'example':
      return 'Example, fictitious: built from the demo data, no AI run';
  }
}
