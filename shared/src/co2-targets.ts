import type { DecisionRecord } from './decision-record.js';
import type { CatalogPart, PurchaseOrderRecord } from './sources.js';

/**
 * CO₂ saving targets on three levels: company, buyer, commodity group (expert interviews,
 * decision of 10 Nov 2026). Set by the Scope 3 manager; pure code over the purchase orders
 * and the decision log. Only avoided CO₂ counts: a decision that adds CO₂ counts as 0.
 */
export interface Co2Targets {
  /** t CO₂e the company wants to avoid this year. */
  company: number;
  /** t CO₂e per buyer, by first name. */
  buyers: Record<string, number>;
  /** t CO₂e per commodity group (category). */
  groups: Record<string, number>;
}

/** A buyer and the commodity groups they are responsible for (several buyers per group are possible). */
export interface BuyerProfile {
  name: string;
  title: string;
  /** Fictitious address on the reserved .example domain, so a mail can never reach a real mailbox. */
  email?: string;
  categories: string[];
}

export type TargetStatus = 'achieved' | 'on track' | 'at risk';

export interface TargetRow {
  key: string;
  targetTonnes: number;
  /** From purchase orders this year after a cockpit decision. */
  orderedTonnes: number;
  /** From decisions recorded in the cockpit that have no orders yet. */
  decidedTonnes: number;
  achievedTonnes: number;
  remainingTonnes: number;
  /** 0–100, capped at 100. */
  percent: number;
  status: TargetStatus;
  /** For a buyer: their commodity groups. For a group: its buyers. */
  related: string[];
}

export interface TargetOverview {
  year: number;
  /** Share of the year already passed (0–1); "on track" means achieved ≥ target × this share. */
  yearElapsed: number;
  company: TargetRow;
  byBuyer: TargetRow[];
  byGroup: TargetRow[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Share of the year passed on `today` (YYYY-MM-DD), 0 before and 1 after the year. */
export function yearElapsed(year: number, today: string): number {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const t = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  return Math.min(1, Math.max(0, (t - start) / (end - start)));
}

function row(key: string, target: number, ordered: number, decided: number, elapsed: number, related: string[]): TargetRow {
  const achieved = ordered + decided;
  const status: TargetStatus = achieved >= target ? 'achieved' : achieved >= target * elapsed ? 'on track' : 'at risk';
  return {
    key,
    targetTonnes: target,
    orderedTonnes: round1(ordered),
    decidedTonnes: round1(decided),
    achievedTonnes: round1(achieved),
    remainingTonnes: round1(Math.max(0, target - achieved)),
    percent: target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0,
    status,
    related,
  };
}

/** Avoided t CO₂e per commodity group this year, split into ordered and newly decided. */
export function avoidedByGroup(
  orders: PurchaseOrderRecord[],
  decisions: DecisionRecord[],
  catalog: Pick<CatalogPart, 'partId' | 'category'>[],
  year: number,
): Record<string, { ordered: number; decided: number }> {
  const categoryOf = (partId: string) => catalog.find((p) => p.partId === partId)?.category ?? 'Other';
  const out: Record<string, { ordered: number; decided: number }> = {};
  const add = (category: string, kind: 'ordered' | 'decided', t: number) => {
    out[category] ??= { ordered: 0, decided: 0 };
    out[category][kind] += t;
  };
  for (const o of orders) {
    if (!o.orderDate.startsWith(`${year}-`) || o.cockpitDecisionId === null || o.replacedPcfKgPerPiece === null) continue;
    add(categoryOf(o.partId), 'ordered', Math.max(0, ((o.replacedPcfKgPerPiece - o.pcfKgPerPiece) * o.quantity) / 1000));
  }
  const ordered = new Set(orders.map((o) => o.cockpitDecisionId).filter((id): id is string => id !== null));
  for (const d of decisions) {
    if (!d.recordedAt.startsWith(`${year}-`) || ordered.has(d.recordId) || d.mode.kind === 'example') continue;
    add(categoryOf(d.partId), 'decided', Math.max(0, -(d.vsCurrent?.co2TotalDeltaT ?? 0)));
  }
  return out;
}

export function targetOverview(input: {
  orders: PurchaseOrderRecord[];
  decisions: DecisionRecord[];
  catalog: Pick<CatalogPart, 'partId' | 'category'>[];
  buyers: BuyerProfile[];
  targets: Co2Targets;
  year: number;
  today: string;
}): TargetOverview {
  const { buyers, targets, year } = input;
  const elapsed = yearElapsed(year, input.today);
  const avoided = avoidedByGroup(input.orders, input.decisions, input.catalog, year);
  const of = (category: string) => avoided[category] ?? { ordered: 0, decided: 0 };
  const groups = [...new Set([...Object.keys(targets.groups), ...buyers.flatMap((b) => b.categories)])].sort();

  const byGroup = groups.map((g) =>
    row(g, targets.groups[g] ?? 0, of(g).ordered, of(g).decided, elapsed, buyers.filter((b) => b.categories.includes(g)).map((b) => b.name)),
  );
  const byBuyer = buyers.map((b) => {
    const sum = b.categories.reduce((a, g) => ({ ordered: a.ordered + of(g).ordered, decided: a.decided + of(g).decided }), { ordered: 0, decided: 0 });
    return row(b.name, targets.buyers[b.name] ?? 0, sum.ordered, sum.decided, elapsed, b.categories);
  });
  const all = Object.values(avoided).reduce((a, v) => ({ ordered: a.ordered + v.ordered, decided: a.decided + v.decided }), { ordered: 0, decided: 0 });
  return { year, yearElapsed: elapsed, company: row('Company', targets.company, all.ordered, all.decided, elapsed, groups), byBuyer, byGroup };
}
