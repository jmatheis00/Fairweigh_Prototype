import type { AgentRun } from './agent.js';
import { verifiedEvidence } from './decision-input.js';

/**
 * Compares an offer with the current supplier (the one with an active
 * contract), from verified values only. Display, not part of the score.
 * A value is null when either side has no verified number.
 */
export interface BaselineComparison {
  offerId: string;
  baselineId: string;
  /** EUR per piece, offer minus baseline (positive = more expensive). */
  priceDeltaEur: number | null;
  pricePercent: number | null;
  /** EUR for the requested quantity. */
  totalDeltaEur: number | null;
  /** kg CO2e per piece, offer minus baseline (negative = less CO2). */
  co2DeltaKg: number | null;
  co2Percent: number | null;
  /** Tonnes CO2e for the requested quantity. */
  co2TotalDeltaT: number | null;
  /** CO2 cost difference in EUR at the given CO2 price (display only). */
  co2CostDeltaEur: number | null;
  /** Price difference plus CO2 cost difference for the quantity (display only). */
  totalWithCo2DeltaEur: number | null;
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

function verifiedNumber(run: AgentRun, supplierId: string, topic: 'price' | 'co2'): number | null {
  const e = verifiedEvidence(run, supplierId, topic);
  return e && typeof e.value === 'number' ? e.value : null;
}

export function compareWithBaseline(
  run: AgentRun,
  offerId: string,
  baselineId: string,
  co2PricePerTonneEur: number,
): BaselineComparison {
  const q = run.request.quantity;
  const p1 = verifiedNumber(run, offerId, 'price');
  const p0 = verifiedNumber(run, baselineId, 'price');
  const c1 = verifiedNumber(run, offerId, 'co2');
  const c0 = verifiedNumber(run, baselineId, 'co2');
  const priceDelta = p1 !== null && p0 !== null ? p1 - p0 : null;
  const co2Delta = c1 !== null && c0 !== null ? c1 - c0 : null;
  const co2Cost = co2Delta === null ? null : ((co2Delta * q) / 1000) * co2PricePerTonneEur;
  return {
    offerId,
    baselineId,
    priceDeltaEur: priceDelta === null ? null : round(priceDelta, 2),
    pricePercent: priceDelta === null || p0 === 0 || p0 === null ? null : round((priceDelta / p0) * 100, 1),
    totalDeltaEur: priceDelta === null ? null : round(priceDelta * q, 2),
    co2DeltaKg: co2Delta === null ? null : round(co2Delta, 2),
    co2Percent: co2Delta === null || c0 === 0 || c0 === null ? null : round((co2Delta / c0) * 100, 1),
    co2TotalDeltaT: co2Delta === null ? null : round((co2Delta * q) / 1000, 2),
    co2CostDeltaEur: co2Cost === null ? null : round(co2Cost, 2),
    totalWithCo2DeltaEur: priceDelta === null || co2Cost === null ? null : round(priceDelta * q + co2Cost, 2),
  };
}
