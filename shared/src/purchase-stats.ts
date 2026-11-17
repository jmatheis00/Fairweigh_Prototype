import { isSupplierSpecific, type PurchaseOrderRecord } from './sources.js';

/**
 * Statistics for the start page (PLAN.md section 9). Pure code: every figure
 * is computed from the purchase order records, nothing is assumed or rounded
 * up. Display only, no influence on any score.
 */

export interface PeriodStats {
  /** e.g. "2026-Q3" */
  quarter: string;
  orders: number;
  spendEur: number;
  co2Tonnes: number;
  /** Share of spend (0–100) whose CO₂ value is supplier-specific ("actual"), not estimated. */
  actualPcfSharePercent: number | null;
}

export interface PurchaseStats {
  previous: PeriodStats;
  current: PeriodStats;
  /** Change of purchased CO₂e, current vs previous quarter, in percent; null if the previous quarter had none. */
  co2ChangePercent: number | null;
  spendChangePercent: number | null;
  /** t CO₂e less in the current quarter than with the replaced suppliers, for orders decided in the cockpit. */
  avoidedTonnes: number;
  /** Distinct cockpit decisions behind the orders of the current quarter. */
  cockpitDecisions: number;
  /** t CO₂e per month and part, both quarters, oldest first. */
  monthly: { month: string; byPart: Record<string, number> }[];
}

/** "2026-08-06" -> "2026-Q3". */
export function quarterOf(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return `${isoDate.slice(0, 4)}-Q${Math.ceil(month / 3)}`;
}

/** "2026-Q3" -> "2026-Q2"; "2026-Q1" -> "2025-Q4". */
export function previousQuarter(quarter: string): string {
  const year = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(6));
  return q === 1 ? `${year - 1}-Q4` : `${year}-Q${q - 1}`;
}

const tonnes = (o: PurchaseOrderRecord) => (o.pcfKgPerPiece * o.quantity) / 1000;
const spend = (o: PurchaseOrderRecord) => o.unitPriceEur * o.quantity;
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function period(orders: PurchaseOrderRecord[], quarter: string): PeriodStats {
  const mine = orders.filter((o) => quarterOf(o.orderDate) === quarter);
  const total = sum(mine.map(spend));
  return {
    quarter,
    orders: mine.length,
    spendEur: round(total, 2),
    co2Tonnes: round(sum(mine.map(tonnes)), 1),
    actualPcfSharePercent:
      total > 0 ? round((sum(mine.filter((o) => isSupplierSpecific(o.pcfBadge)).map(spend)) / total) * 100, 1) : null,
  };
}

const change = (now: number, before: number) => (before > 0 ? round(((now - before) / before) * 100, 1) : null);

/** Compares the latest quarter in the data with the one before. Null without orders. */
export function purchaseStats(orders: PurchaseOrderRecord[]): PurchaseStats | null {
  if (orders.length === 0) return null;
  const latest = orders.map((o) => quarterOf(o.orderDate)).sort().at(-1)!;
  const previous = period(orders, previousQuarter(latest));
  const current = period(orders, latest);
  const inCurrent = orders.filter((o) => quarterOf(o.orderDate) === latest);
  const decided = inCurrent.filter((o) => o.cockpitDecisionId !== null);

  const months = [...new Set(orders.filter((o) => [latest, previous.quarter].includes(quarterOf(o.orderDate))).map((o) => o.orderDate.slice(0, 7)))].sort();
  return {
    previous,
    current,
    co2ChangePercent: change(current.co2Tonnes, previous.co2Tonnes),
    spendChangePercent: change(current.spendEur, previous.spendEur),
    avoidedTonnes: round(
      sum(
        decided
          .filter((o) => o.replacedPcfKgPerPiece !== null)
          .map((o) => ((o.replacedPcfKgPerPiece! - o.pcfKgPerPiece) * o.quantity) / 1000),
      ),
      1,
    ),
    cockpitDecisions: new Set(decided.map((o) => o.cockpitDecisionId)).size,
    monthly: months.map((month) => {
      const byPart: Record<string, number> = {};
      for (const o of orders.filter((x) => x.orderDate.startsWith(month))) {
        byPart[o.partId] = round((byPart[o.partId] ?? 0) + tonnes(o), 3);
      }
      return { month, byPart };
    }),
  };
}
