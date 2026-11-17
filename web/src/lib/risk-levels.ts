/**
 * Thresholds for the colour coding in the supplier list (expert interviews, 10 Nov 2026).
 * Display only: they never change the score. Explained on the glossary page.
 * Colour always comes with an icon and a word (CLAUDE.md).
 */
export type RiskLevel = "high" | "medium" | "low";

export const COMPLAINT_THRESHOLDS = { high: 1.5, medium: 1.0 } as const;
export const RATING_THRESHOLDS = { high: 40, medium: 60 } as const;

/** Complaint rate in % of deliveries: 1.5 % or more is high, from 1.0 % medium. */
export function complaintLevel(percent: number): RiskLevel {
  return percent >= COMPLAINT_THRESHOLDS.high ? "high" : percent >= COMPLAINT_THRESHOLDS.medium ? "medium" : "low";
}

/** Sustainability rating 0–100: below 40 is a high risk, below 60 medium. */
export function ratingLevel(score: number): RiskLevel {
  return score < RATING_THRESHOLDS.high ? "high" : score < RATING_THRESHOLDS.medium ? "medium" : "low";
}

export const LEVEL_WORD: Record<RiskLevel, string> = { high: "high", medium: "medium", low: "low" };
