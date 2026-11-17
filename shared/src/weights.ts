import { CRITERIA, type Criterion, type Weights } from './decision.js';

/**
 * Protection against tuning the weights until a favourite wins (expert interviews,
 * decision of 10 Nov 2026): the company sets a default per commodity group, and the
 * buyer may move each weight by at most this many percentage points.
 */
export const WEIGHT_DEVIATION_LIMIT = 10;

/** Lowest and highest allowed weight per criterion around the defaults. */
export function weightBounds(defaults: Weights, limit = WEIGHT_DEVIATION_LIMIT): Record<Criterion, { min: number; max: number }> {
  return Object.fromEntries(
    CRITERIA.map((c) => [c, { min: Math.max(0, defaults[c] - limit), max: Math.min(100, defaults[c] + limit) }]),
  ) as Record<Criterion, { min: number; max: number }>;
}

/** True when at least one weight differs from the defaults. */
export function weightsDeviate(weights: Weights, defaults: Weights): boolean {
  return CRITERIA.some((c) => weights[c] !== defaults[c]);
}

/** Throws when a weight is outside the allowed range around the defaults. */
export function checkWeightLimits(weights: Weights, defaults: Weights, limit = WEIGHT_DEVIATION_LIMIT): void {
  const bounds = weightBounds(defaults, limit);
  for (const c of CRITERIA) {
    if (weights[c] < bounds[c].min || weights[c] > bounds[c].max) {
      throw new Error(`Weight for ${c} must stay between ${bounds[c].min} % and ${bounds[c].max} % (company default ±${limit} points)`);
    }
  }
}
