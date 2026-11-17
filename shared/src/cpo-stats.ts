import type { DecisionRecord } from './decision-record.js';
import { inPeriod, previousPeriod, type Period } from './period.js';
import { isSupplierSpecific, type ErpRecord, type PurchaseOrderRecord } from './sources.js';

/**
 * Key figures for the CPO dashboard (decision of 12 Nov 2026). Pure code over the
 * purchase orders, the decision log and the supplier master data; nothing is estimated.
 */

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export interface Co2Intensity {
  spendEur: number;
  co2Tonnes: number;
  /** kg CO₂e per EUR spent; null without spend. */
  kgPerEur: number | null;
  /** Same figure for the period of the same length before; null without spend there. */
  previousKgPerEur: number | null;
  /** Share of spend whose CO₂ value is supplier-specific (levels 1 and 2), 0–100; null without spend. */
  supplierSpecificPercent: number | null;
}

/** CO₂ per euro and data quality of the purchases in a period. */
export function co2Intensity(orders: PurchaseOrderRecord[], period: Period): Co2Intensity {
  const sums = (p: Period) => {
    const inP = orders.filter((o) => inPeriod(o.orderDate, p));
    const spend = inP.reduce((a, o) => a + o.unitPriceEur * o.quantity, 0);
    const kg = inP.reduce((a, o) => a + o.pcfKgPerPiece * o.quantity, 0);
    const specific = inP.filter((o) => isSupplierSpecific(o.pcfBadge)).reduce((a, o) => a + o.unitPriceEur * o.quantity, 0);
    return { spend, kg, specific };
  };
  const now = sums(period);
  const before = sums(previousPeriod(period));
  return {
    spendEur: round(now.spend, 2),
    co2Tonnes: round(now.kg / 1000, 1),
    kgPerEur: now.spend > 0 ? round(now.kg / now.spend, 3) : null,
    previousKgPerEur: before.spend > 0 ? round(before.kg / before.spend, 3) : null,
    supplierSpecificPercent: now.spend > 0 ? round((now.specific / now.spend) * 100, 0) : null,
  };
}

export interface CockpitUse {
  /** Decisions recorded in the cockpit in the period. */
  decisions: number;
  /** Share following the recommendation, 0–100; null without decisions. */
  followsRecommendationPercent: number | null;
}

/** How the cockpit is used: decisions recorded in the period and how often they follow the recommendation. */
export function cockpitUse(log: DecisionRecord[], period: Period): CockpitUse {
  const inP = log.filter((d) => inPeriod(d.recordedAt.slice(0, 10), period));
  return {
    decisions: inP.length,
    followsRecommendationPercent: inP.length > 0 ? round((inP.filter((d) => d.followsRecommendation).length / inP.length) * 100, 0) : null,
  };
}

export interface EndingContract {
  supplierId: string;
  category: string;
  contractEnd: string;
  annualSpendEur: number | null;
  daysLeft: number;
}

/** Contracts of active suppliers that end within the next `months` months after `today`, soonest first. */
export function contractsEnding(erp: ErpRecord[], today: string, months = 6): EndingContract[] {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return erp
    .filter((e) => e.relationshipStatus === 'Active contract' && e.contractEnd !== null)
    .map((e) => ({
      supplierId: e.supplierId,
      category: e.category,
      contractEnd: e.contractEnd!,
      annualSpendEur: e.annualSpendEur,
      daysLeft: Math.round((Date.parse(`${e.contractEnd!}T00:00:00Z`) - start) / 86_400_000),
    }))
    .filter((c) => c.daysLeft >= 0 && Date.parse(`${c.contractEnd}T00:00:00Z`) <= end.getTime())
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** A contract ending within this many days needs action on the CPO dashboard (decision of 16 Nov 2026). */
export const CONTRACT_ACTION_DAYS = 60;

/** True when at least one of the contracts ends within `CONTRACT_ACTION_DAYS`. */
export function needsContractAction(ending: EndingContract[]): boolean {
  return ending.some((c) => c.daysLeft <= CONTRACT_ACTION_DAYS);
}

/**
 * Serious supplier risks (decision of 16 Nov 2026): a certificate that has already expired, or LkSG country risk "High".
 * Certificates that merely expire soon and a missing rating are not serious. Active suppliers only.
 */
export function seriousRiskSupplierIds(
  erp: ErpRecord[],
  ratings: { supplierId: string; lksgCountryRisk: 'Low' | 'Medium' | 'High' | null }[],
  certificates: { supplierId: string; validUntil: string }[],
  today: string,
): string[] {
  const now = Date.parse(`${today}T00:00:00Z`);
  const high = new Set(ratings.filter((r) => r.lksgCountryRisk === 'High').map((r) => r.supplierId));
  const expired = new Set(certificates.filter((c) => Date.parse(`${c.validUntil}T00:00:00Z`) < now).map((c) => c.supplierId));
  return erp.filter((e) => e.relationshipStatus === 'Active contract' && (high.has(e.supplierId) || expired.has(e.supplierId))).map((e) => e.supplierId);
}
