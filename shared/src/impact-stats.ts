import type { DecisionRecord } from './decision-record.js';
import { inPeriod, periodOptions, type Period } from './period.js';
import type { PurchaseOrderRecord } from './sources.js';

/**
 * Impact of cockpit decisions for the CPO (PLAN.md section 9). Pure code over
 * the purchase orders and the decision log; nothing is estimated here. The
 * CO₂ euro value is display only, as everywhere in the cockpit.
 */

export interface DecisionImpact {
  decisionId: string;
  partId: string;
  supplierId: string;
  replacedSupplierId: string;
  /** Positive = more expensive than the replaced supplier, negative = cheaper. */
  extraCostEur: number;
  avoidedTonnes: number;
  /** EUR per tonne CO₂e avoided; null when nothing was avoided. Negative = saves money too. */
  costPerTonneEur: number | null;
}

export interface ImpactStats {
  period: Period;
  decisions: DecisionImpact[];
  extraCostEur: number;
  avoidedTonnes: number;
  costPerTonneEur: number | null;
  /** Avoided tonnes × CO₂ price of the rules; information only. */
  co2ValueEur: number;
  /** Decision log: all recorded decisions and the share that follows the recommendation (0–100). */
  recordedDecisions: number;
  followsRecommendationPercent: number | null;
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Default period: the latest quarter with orders. */
export function impactStats(
  orders: PurchaseOrderRecord[],
  log: DecisionRecord[],
  co2PricePerTonneEur: number,
  periodArg?: Period,
): ImpactStats | null {
  // With a given period, no orders simply means zero impact (e.g. a commodity group without orders).
  const period = periodArg ?? periodOptions(orders.map((o) => o.orderDate))?.latest;
  if (!period) return null;
  const decided = orders.filter(
    (o) =>
      inPeriod(o.orderDate, period) &&
      o.cockpitDecisionId !== null &&
      o.replacedSupplierId !== null &&
      o.replacedPcfKgPerPiece !== null &&
      o.replacedUnitPriceEur !== null,
  );

  const byDecision = new Map<string, { o: PurchaseOrderRecord; cost: number; tonnes: number }>();
  for (const o of decided) {
    const entry = byDecision.get(o.cockpitDecisionId!) ?? { o, cost: 0, tonnes: 0 };
    entry.cost += (o.unitPriceEur - o.replacedUnitPriceEur!) * o.quantity;
    entry.tonnes += ((o.replacedPcfKgPerPiece! - o.pcfKgPerPiece) * o.quantity) / 1000;
    byDecision.set(o.cockpitDecisionId!, entry);
  }
  const perTonne = (cost: number, tonnes: number) => (tonnes > 0 ? round(cost / tonnes, 1) : null);
  const decisions: DecisionImpact[] = [...byDecision.entries()].map(([decisionId, { o, cost, tonnes }]) => ({
    decisionId,
    partId: o.partId,
    supplierId: o.supplierId,
    replacedSupplierId: o.replacedSupplierId!,
    extraCostEur: round(cost, 2),
    avoidedTonnes: round(tonnes, 2),
    costPerTonneEur: perTonne(cost, tonnes),
  }));
  const extra = decisions.reduce((a, d) => a + d.extraCostEur, 0);
  const tonnes = [...byDecision.values()].reduce((a, d) => a + d.tonnes, 0);

  return {
    period,
    decisions,
    extraCostEur: round(extra, 2),
    avoidedTonnes: round(tonnes, 1),
    costPerTonneEur: perTonne(extra, tonnes),
    co2ValueEur: round(tonnes * co2PricePerTonneEur, 0),
    recordedDecisions: log.length,
    followsRecommendationPercent: log.length > 0 ? round((log.filter((d) => d.followsRecommendation).length / log.length) * 100, 0) : null,
  };
}
