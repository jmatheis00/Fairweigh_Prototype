import { CRITERIA, type Criterion, type Weights } from './decision.js';

/**
 * Protection against tuning the weights until a favourite wins (Sprint 3 expert interview:
 * "management sets limits, e.g. CO₂ not below 10 %"). Since 18 Nov 2026 every criterion
 * may be set between these two values; before it was the company default ±10 points.
 * A company default outside the range stays allowed, so "Reset" always works.
 */
export const WEIGHT_MIN = 10;
export const WEIGHT_MAX = 50;

/** Lowest and highest allowed weight per criterion. */
export function weightBounds(defaults: Weights): Record<Criterion, { min: number; max: number }> {
  return Object.fromEntries(
    CRITERIA.map((c) => [c, { min: Math.min(WEIGHT_MIN, defaults[c]), max: Math.max(WEIGHT_MAX, defaults[c]) }]),
  ) as Record<Criterion, { min: number; max: number }>;
}

/** True when at least one weight differs from the defaults. */
export function weightsDeviate(weights: Weights, defaults: Weights): boolean {
  return CRITERIA.some((c) => weights[c] !== defaults[c]);
}

/** Throws when a weight is outside the allowed range. */
export function checkWeightLimits(weights: Weights, defaults: Weights): void {
  const bounds = weightBounds(defaults);
  for (const c of CRITERIA) {
    if (weights[c] < bounds[c].min || weights[c] > bounds[c].max) {
      throw new Error(`Weight for ${c} must stay between ${bounds[c].min} % and ${bounds[c].max} %`);
    }
  }
}
