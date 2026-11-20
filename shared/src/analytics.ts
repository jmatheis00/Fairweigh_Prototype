import { addPeriodMonths } from './period.js';
import type {
  CatalogPart,
  CompanyEmissionsRecord,
  DocumentRecord,
  ErpRecord,
  Offer,
  PcfRecord,
  PcfBadge,
  PurchaseOrderRecord,
  RatingRecord,
  SupplierPerformanceMonth,
} from './sources.js';

/**
 * Analytics for the dashboards (decision of 8 Nov 2026). Pure code over the
 * connected systems; nothing is estimated beyond what each function states.
 */

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------------ */
/* Supplier base against the category benchmark                         */
/* ------------------------------------------------------------------ */

export type SupplierQuadrant = 'Switch candidate' | 'Keep' | 'Watch' | 'Fine';

export interface SupplierBasePoint {
  supplierId: string;
  category: string;
  /** Spend of the last 12 months in the client ERP. */
  spendEur: number;
  /** Company CO₂ intensity (kg CO₂e per EUR revenue) from the rating partner. */
  intensityKgPerEur: number;
  /** Average intensity of all suppliers of the category (internal benchmark). */
  categoryAverageKgPerEur: number;
  /** + = more CO₂ per EUR than the category average, in percent. */
  versusAveragePercent: number;
  /** Spend-based estimate of the CO₂ bought from this supplier: spend × intensity. */
  co2Tonnes: number;
  quadrant: SupplierQuadrant;
}

export interface SupplierBaseStats {
  points: SupplierBasePoint[];
  medianSpendEur: number;
  totalSpendEur: number;
  totalCo2Tonnes: number;
  /** Fewest suppliers that make up 80 % of spend (Pareto), and their share of the CO₂. */
  pareto: { suppliers: number; spendSharePercent: number; co2SharePercent: number };
}

/**
 * Current suppliers (active contract) against the average CO₂ intensity of their category.
 * High spend and above-average intensity = switch candidate. Spend-based CO₂ is a standard
 * screening method (GHG Protocol, Scope 3 category 1), not a product footprint.
 */
export function supplierBaseStats(
  erp: ErpRecord[],
  performance: SupplierPerformanceMonth[],
  emissions: CompanyEmissionsRecord[],
): SupplierBaseStats | null {
  const intensity = new Map(emissions.filter((e) => e.intensityKgPerEur !== null).map((e) => [e.supplierId, e.intensityKgPerEur!]));
  const categoryAverage = (category: string) => {
    const values = erp.filter((e) => e.category === category && intensity.has(e.supplierId)).map((e) => intensity.get(e.supplierId)!);
    return values.length ? sum(values) / values.length : null;
  };
  const base = erp
    .filter((e) => e.relationshipStatus === 'Active contract' && intensity.has(e.supplierId))
    .map((e) => {
      const spend = sum(performance.filter((p) => p.supplierId === e.supplierId).slice(-12).map((p) => p.spendEur));
      const avg = categoryAverage(e.category)!;
      const own = intensity.get(e.supplierId)!;
      return {
        supplierId: e.supplierId,
        category: e.category,
        spendEur: spend,
        intensityKgPerEur: own,
        categoryAverageKgPerEur: round(avg, 3),
        versusAveragePercent: round(((own - avg) / avg) * 100, 1),
        co2Tonnes: round((spend * own) / 1000, 1),
      };
    })
    .filter((p) => p.spendEur > 0);
  if (base.length === 0) return null;

  const sorted = [...base].map((p) => p.spendEur).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const points: SupplierBasePoint[] = base.map((p) => ({
    ...p,
    quadrant:
      p.spendEur >= median ? (p.versusAveragePercent > 0 ? 'Switch candidate' : 'Keep') : p.versusAveragePercent > 0 ? 'Watch' : 'Fine',
  }));

  const totalSpend = sum(points.map((p) => p.spendEur));
  const totalCo2 = sum(points.map((p) => p.co2Tonnes));
  let running = 0;
  let count = 0;
  let co2 = 0;
  for (const p of [...points].sort((a, b) => b.spendEur - a.spendEur)) {
    if (running >= 0.8 * totalSpend) break;
    running += p.spendEur;
    co2 += p.co2Tonnes;
    count += 1;
  }
  return {
    points,
    medianSpendEur: median,
    totalSpendEur: totalSpend,
    totalCo2Tonnes: round(totalCo2, 1),
    pareto: {
      suppliers: count,
      spendSharePercent: round((running / totalSpend) * 100, 1),
      co2SharePercent: totalCo2 > 0 ? round((co2 / totalCo2) * 100, 1) : 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Next best actions: supplier switches by cost per tonne CO₂ avoided   */
/* ------------------------------------------------------------------ */

export interface AbatementOption {
  partId: string;
  fromSupplierId: string;
  toSupplierId: string;
  /** Pieces bought in the last 12 months (client ERP). */
  annualQuantity: number;
  avoidedTonnes: number;
  /** + = more expensive per year, − = saves money. */
  extraCostEur: number;
  /** EUR per tonne avoided; negative = saves money and CO₂. */
  costPerTonneEur: number;
  /** Data quality of the new supplier's CO₂ value. */
  badge: PcfBadge;
}

const CHILD_OR_FORCED = /\b(child|forced)\s+labou?r\b/i;

/** Same knock-out rules as the decision engine, applied to the records directly. */
export function isExcludedSupplier(supplierId: string, ratings: RatingRecord[], documents: DocumentRecord[]): boolean {
  if (documents.some((d) => d.supplierId === supplierId && d.documentType === 'fine_notice')) return true;
  const r = ratings.find((x) => x.supplierId === supplierId);
  if (!r) return false;
  if (r.controversies && CHILD_OR_FORCED.test(r.controversies)) return true;
  return r.lksgCountryRisk === 'High' && !/\bSA8000\b/.test(r.certifications ?? '');
}

/**
 * For every product, switching from today's supplier to each other offer that avoids CO₂,
 * at last year's quantity. Sorted by cost per tonne: the cheapest CO₂ first (negative = saves money too).
 * Excluded offers (knock-outs) are left out.
 */
export function abatementOptions(input: {
  catalog: CatalogPart[];
  offers: Offer[];
  pcf: PcfRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  ratings: RatingRecord[];
  documents: DocumentRecord[];
  /** Last month of the 12-month window, YYYY-MM. */
  lastMonth: string;
}): AbatementOption[] {
  const from = addPeriodMonths(input.lastMonth, -11);
  const out: AbatementOption[] = [];
  for (const part of input.catalog.filter((c) => c.hasOffers && c.currentSupplierId)) {
    const current = part.currentSupplierId!;
    const quantity = sum(
      input.purchaseOrders
        .filter((o) => o.partId === part.partId && o.orderDate.slice(0, 7) >= from && o.orderDate.slice(0, 7) <= input.lastMonth)
        .map((o) => o.quantity),
    );
    const priceOf = (id: string) => input.offers.find((o) => o.partId === part.partId && o.supplierId === id)?.unitPriceEur ?? null;
    const pcfOf = (id: string) => input.pcf.find((p) => p.partId === part.partId && p.supplierId === id) ?? null;
    const curPrice = priceOf(current);
    const curPcf = pcfOf(current);
    if (quantity === 0 || curPrice === null || curPcf === null) continue;
    for (const offer of input.offers.filter((o) => o.partId === part.partId && o.supplierId !== current)) {
      const pcf = pcfOf(offer.supplierId);
      if (!pcf || isExcludedSupplier(offer.supplierId, input.ratings, input.documents)) continue;
      const avoided = ((curPcf.pcfKgPerPiece - pcf.pcfKgPerPiece) * quantity) / 1000;
      if (avoided <= 0) continue;
      const extra = (offer.unitPriceEur - curPrice) * quantity;
      out.push({
        partId: part.partId,
        fromSupplierId: current,
        toSupplierId: offer.supplierId,
        annualQuantity: quantity,
        avoidedTonnes: round(avoided, 1),
        extraCostEur: round(extra, 0),
        costPerTonneEur: round(extra / avoided, 1),
        badge: pcf.badge,
      });
    }
  }
  return out.sort((a, b) => a.costPerTonneEur - b.costPerTonneEur);
}

/**
 * Leaves out switches the Decision Log already holds (20 Nov 2026): once a buyer has awarded a part to a supplier,
 * that switch is done, not a next action, even before the first order reaches the ERP.
 */
export function withoutDecidedSwitches(
  options: AbatementOption[],
  decisions: ReadonlyArray<{ partId: string; chosenSupplierId: string }>,
): AbatementOption[] {
  return options.filter((o) => !decisions.some((d) => d.partId === o.partId && d.chosenSupplierId === o.toSupplierId));
}

/* ------------------------------------------------------------------ */
/* Purchased CO₂ per month against a target path                        */
/* ------------------------------------------------------------------ */

export interface Co2TrendPoint {
  month: string;
  actualTonnes: number;
  targetTonnes: number;
}

/**
 * Purchased CO₂e per month (purchase orders × CO₂ per piece) against a linear target path:
 * the 2025 monthly average falls by `reductionPercentPerYear` every year (4.2 % = SBTi 1.5 °C
 * cross-sector pathway), centred on mid-2025.
 */
export function co2TargetPath(orders: PurchaseOrderRecord[], reductionPercentPerYear = 4.2): Co2TrendPoint[] {
  const byMonth = new Map<string, number>();
  for (const o of orders) {
    const m = o.orderDate.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + (o.pcfKgPerPiece * o.quantity) / 1000);
  }
  const months = [...byMonth.keys()].sort();
  const base = months.filter((m) => m.startsWith('2025'));
  if (base.length === 0) return [];
  const baseline = sum(base.map((m) => byMonth.get(m)!)) / base.length;
  const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
  const centre = index('2025-06') + 0.5;
  return months.map((month) => ({
    month,
    actualTonnes: round(byMonth.get(month)!, 1),
    targetTonnes: round(baseline * (1 - (reductionPercentPerYear / 100) * ((index(month) - centre) / 12)), 1),
  }));
}
