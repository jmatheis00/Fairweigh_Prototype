import { daysBetween } from './decision-input.js';
import { inPeriod, periodOptions, previousPeriod, type Period } from './period.js';
import { isSupplierSpecific } from './sources.js';
import type { DocumentRecord, ErpRecord, PcfBadge, PcfRecord, PurchaseOrderRecord, RatingRecord } from './sources.js';

/**
 * Statistics for the sustainability page (Sarah, Scope 3 manager; PLAN.md
 * section 9). Pure code over the demo records: nothing is estimated here,
 * and missing values are counted as missing, never as good.
 */

export interface Hotspot {
  supplierId: string;
  partId: string;
  co2Tonnes: number;
  /** Share of the quarter's purchased CO₂e, 0–100. */
  sharePercent: number;
}

export interface Co2DataQuality {
  supplierId: string;
  partId: string;
  pcfRecordId: string;
  badge: PcfBadge;
  referenceDate: string;
  ageDays: number;
  /** Older than the CO₂ age threshold of the settings. */
  outdated: boolean;
  /** Where the supplier's CO₂ data comes from, from the rating. */
  dataSource: string | null;
}

/**
 * Sustainability data in the source systems:
 * - sufficient: CO₂ data from the supplier itself (report, self-assessment, PCF declaration) and a sustainability rating
 * - partial: only one of the two
 * - insufficient: neither (an industry average or a web search is not supplier data)
 */
export type DataLevel = 'sufficient' | 'partial' | 'insufficient';

export const SUPPLIER_CO2_SOURCES = ['Sustainability report', 'Supplier self-assessment', 'Supplier PCF declaration'];

export function dataLevel(r: RatingRecord): { level: DataLevel; missing: string[] } {
  const missing = [
    ...(r.co2DataSource !== null && SUPPLIER_CO2_SOURCES.includes(r.co2DataSource) ? [] : ['CO₂ data from the supplier']),
    ...(r.sustainabilityScore !== null ? [] : ['sustainability rating']),
  ];
  return { level: missing.length === 0 ? 'sufficient' : missing.length === 1 ? 'partial' : 'insufficient', missing };
}

export interface SupplierFlag {
  supplierId: string;
  /** e.g. "LkSG risk High", "Controversy reported", "Proven violation". */
  flags: string[];
}

export interface SustainabilityStats {
  /** Period of the purchase figures (hotspots, data quality); the supplier base is not time-bound. */
  period: Period;
  co2Tonnes: number;
  /** Same figure for the period of the same length before; null if there were no orders then. */
  previous: { period: Period; co2Tonnes: number } | null;
  /** Share of the period's spend with supplier-specific CO₂ data (levels 1 and 2), 0–100; null without spend. */
  supplierSpecificSpendPercent: number | null;
  hotspots: Hotspot[];
  dataQuality: Co2DataQuality[];
  /** Active-contract suppliers: the ones the company buys from today. */
  activeSuppliers: number;
  /** All suppliers in the base. */
  allSuppliers: number;
  /** Is enough sustainability data in the source systems? Counted over the whole base. */
  dataLevels: { sufficient: number; partial: number; insufficient: number };
  /** Suppliers without sufficient data, with what is missing; insufficient first. */
  dataGaps: { supplierId: string; level: DataLevel; missing: string[] }[];
  risk: {
    lksgHigh: number;
    lksgMedium: number;
    controversies: number;
    provenViolations: number;
    /** Shares of active suppliers, 0–100; null without active suppliers. */
    sbtiPercent: number | null;
    reportPercent: number | null;
  };
  /** All suppliers in the base (not only active) with at least one flag, worst first. */
  flagged: SupplierFlag[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);

export interface PurchasedCo2 {
  period: Period;
  co2Tonnes: number;
  /** Share of spend whose CO₂ value comes from the supplier (not an estimate or industry average), 0–100. */
  supplierSpecificSpendPercent: number | null;
  /** The period before, or null without orders there. */
  previous: { period: Period; co2Tonnes: number; supplierSpecificSpendPercent: number | null } | null;
}

/**
 * Purchased CO₂e (Scope 3, cat. 1) of a period and the period before: order quantity × CO₂ per piece.
 * One function for the Results page and the sustainability stats, so both show the same numbers (20 Nov 2026).
 */
export function purchasedCo2(orders: PurchaseOrderRecord[], period: Period): PurchasedCo2 {
  const sums = (list: PurchaseOrderRecord[]) => {
    const spend = list.reduce((a, o) => a + o.unitPriceEur * o.quantity, 0);
    const specific = list.filter((o) => isSupplierSpecific(o.pcfBadge)).reduce((a, o) => a + o.unitPriceEur * o.quantity, 0);
    return {
      co2Tonnes: round1(list.reduce((a, o) => a + (o.pcfKgPerPiece * o.quantity) / 1000, 0)),
      supplierSpecificSpendPercent: percent(specific, spend),
    };
  };
  const before = previousPeriod(period);
  const previousOrders = orders.filter((o) => inPeriod(o.orderDate, before));
  return {
    period,
    ...sums(orders.filter((o) => inPeriod(o.orderDate, period))),
    previous: previousOrders.length > 0 ? { period: before, ...sums(previousOrders) } : null,
  };
}

const hasControversy = (r: RatingRecord) => r.controversies !== null && r.controversies !== 'None known';

/**
 * Risk flags per supplier (the team rule set): a proven violation (fine notice), LkSG country risk High,
 * a reported controversy. Only suppliers with at least one flag, most flags first. Shared by the
 * sustainability page and the suppliers page, so both flag the same suppliers (19 Nov 2026).
 */
export function supplierFlags(ratings: RatingRecord[], documents: DocumentRecord[]): SupplierFlag[] {
  const violations = new Set(documents.filter((d) => d.documentType === 'fine_notice').map((d) => d.supplierId));
  return ratings
    .map((r) => ({
      supplierId: r.supplierId,
      flags: [
        ...(violations.has(r.supplierId) ? ['Proven violation'] : []),
        ...(r.lksgCountryRisk === 'High' ? ['LkSG risk High'] : []),
        ...(hasControversy(r) ? ['Controversy reported'] : []),
      ],
    }))
    .filter((f) => f.flags.length > 0)
    .sort((a, b) => b.flags.length - a.flags.length || a.supplierId.localeCompare(b.supplierId));
}

export interface SustainabilityInput {
  orders: PurchaseOrderRecord[];
  erp: ErpRecord[];
  ratings: RatingRecord[];
  pcf: PcfRecord[];
  documents: DocumentRecord[];
  today: string;
  co2MaxAgeDays: number;
  /** Default: the latest quarter with orders. */
  period?: Period;
}

export function sustainabilityStats(input: SustainabilityInput): SustainabilityStats | null {
  const { orders, erp, ratings, pcf, documents, today, co2MaxAgeDays } = input;
  const options = periodOptions(orders.map((o) => o.orderDate));
  if (!options) return null;
  const period = input.period ?? options.latest;
  const current = orders.filter((o) => inPeriod(o.orderDate, period));

  // Hotspots: purchased CO₂e per supplier and part in the period.
  const byKey = new Map<string, Hotspot>();
  for (const o of current) {
    const key = `${o.supplierId}|${o.partId}`;
    const h = byKey.get(key) ?? { supplierId: o.supplierId, partId: o.partId, co2Tonnes: 0, sharePercent: 0 };
    h.co2Tonnes += (o.pcfKgPerPiece * o.quantity) / 1000;
    byKey.set(key, h);
  }
  const total = [...byKey.values()].reduce((a, h) => a + h.co2Tonnes, 0);
  const hotspots = [...byKey.values()]
    .map((h) => ({ ...h, co2Tonnes: round1(h.co2Tonnes), sharePercent: total > 0 ? round1((h.co2Tonnes / total) * 100) : 0 }))
    .sort((a, b) => b.co2Tonnes - a.co2Tonnes);

  // Data quality of the CO₂ values behind these purchases.
  const dataQuality: Co2DataQuality[] = hotspots.flatMap((h) => {
    const record = pcf.find((p) => p.supplierId === h.supplierId && p.partId === h.partId);
    if (!record) return [];
    const ageDays = daysBetween(record.referenceDate, today);
    return [
      {
        supplierId: h.supplierId,
        partId: h.partId,
        pcfRecordId: record.recordId,
        badge: record.badge,
        referenceDate: record.referenceDate,
        ageDays,
        outdated: ageDays >= co2MaxAgeDays,
        dataSource: ratings.find((r) => r.supplierId === h.supplierId)?.co2DataSource ?? null,
      },
    ];
  });

  // Sustainability data per supplier, over the whole base (missing values never count as present).
  const levels = ratings.map((r) => ({ supplierId: r.supplierId, ...dataLevel(r) }));
  const dataLevels = {
    sufficient: levels.filter((l) => l.level === 'sufficient').length,
    partial: levels.filter((l) => l.level === 'partial').length,
    insufficient: levels.filter((l) => l.level === 'insufficient').length,
  };
  const dataGaps = levels
    .filter((l) => l.level !== 'sufficient')
    .sort((a, b) => (a.level === b.level ? a.supplierId.localeCompare(b.supplierId) : a.level === 'insufficient' ? -1 : 1));

  // Rules: counted over the suppliers with an active contract.
  const active = new Set(erp.filter((e) => e.relationshipStatus === 'Active contract').map((e) => e.supplierId));
  const activeRatings = ratings.filter((r) => active.has(r.supplierId));
  const violations = new Set(documents.filter((d) => d.documentType === 'fine_notice').map((d) => d.supplierId));
  const flagged = supplierFlags(ratings, documents);

  const purchased = purchasedCo2(orders, period);
  return {
    period,
    co2Tonnes: purchased.co2Tonnes,
    supplierSpecificSpendPercent: purchased.supplierSpecificSpendPercent,
    previous: purchased.previous ? { period: purchased.previous.period, co2Tonnes: purchased.previous.co2Tonnes } : null,
    hotspots,
    dataQuality,
    activeSuppliers: activeRatings.length,
    allSuppliers: ratings.length,
    dataLevels,
    dataGaps,
    risk: {
      lksgHigh: activeRatings.filter((r) => r.lksgCountryRisk === 'High').length,
      lksgMedium: activeRatings.filter((r) => r.lksgCountryRisk === 'Medium').length,
      controversies: activeRatings.filter(hasControversy).length,
      provenViolations: [...violations].filter((id) => active.has(id)).length,
      sbtiPercent: percent(activeRatings.filter((r) => r.sbtiTarget === true).length, activeRatings.length),
      reportPercent: percent(activeRatings.filter((r) => r.sustainabilityReport === true).length, activeRatings.length),
    },
    flagged,
  };
}
