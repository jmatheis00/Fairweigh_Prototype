import {
  DEMO_DATA_NOTICE,
  type Benchmark,
  type Benchmarks,
  type NewSupplierAssumption,
  type CompanyEmissionsRecord,
  type DemoDataset,
  type ErpRecord,
  type Offer,
  type PcfRecord,
  type PublicBenchmarkFactor,
  type PurchaseOrderRecord,
  type RatingRecord,
  type SourceProvenance,
} from '@scc/shared';
import type { Assumptions, PartAssumptions } from './assumptions.ts';
import type { DemoCaseSheets } from './excel.ts';
import { buildExampleDecisions } from './example-decisions.ts';
import { fineNoticeDocument, offerDocument } from './offer-document.ts';
import { addSupportingDocuments } from './supporting-documents.ts';

import { purchaseRequisitions } from './requisitions.ts';
import { DEMO_DATE, addMonths, certificates, hash, ratingHistory, riskAlerts, supplierPerformance } from './source-history.ts';

/** One row of the "Suppliers" sheet: column name -> cell value, plus its row number. */
export interface SupplierRow {
  row: number;
  values: Record<string, unknown>;
  /** Set for rows that do not come from the Excel (new fictitious suppliers). */
  file?: string;
  sheet?: string;
  /** Columns changed by data/assumptions.json "overrides". */
  assumed?: string[];
}

export const SOURCE_FILE = 'data/source/Supplier_Dummy_Data_v2.xlsx';
export const SOURCE_SHEET = 'Suppliers';

/** Empty cells, empty strings and missing columns become null. */
function cell(row: SupplierRow, column: string): unknown {
  const value = row.values[column];
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return value;
}

function text(row: SupplierRow, column: string): string | null {
  const value = cell(row, column);
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Row ${row.row}, ${column}: expected text, got ${typeof value}`);
  }
  return value.trim();
}

function requiredText(row: SupplierRow, column: string): string {
  const value = text(row, column);
  if (value === null) {
    throw new Error(`Row ${row.row}, ${column}: value is required`);
  }
  return value;
}

function num(row: SupplierRow, column: string): number | null {
  const value = cell(row, column);
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Row ${row.row}, ${column}: expected a number, got ${String(value)}`);
  }
  return value;
}

/** The Excel stores shares as fractions (0.89). We store percent (89). */
function percent(row: SupplierRow, column: string): number | null {
  const value = num(row, column);
  if (value === null) return null;
  if (value < 0 || value > 1) {
    throw new Error(`Row ${row.row}, ${column}: expected a fraction between 0 and 1, got ${value}`);
  }
  return Math.round(value * 100 * 100) / 100;
}

/** Dates become ISO dates (YYYY-MM-DD). The Excel has no times of day. */
function date(row: SupplierRow, column: string): string | null {
  const value = cell(row, column);
  if (value === null) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`Row ${row.row}, ${column}: expected a date, got ${String(value)}`);
  }
  return value.toISOString().slice(0, 10);
}

function yesNo(row: SupplierRow, column: string): boolean | null {
  const value = text(row, column);
  if (value === null) return null;
  if (value === 'Yes') return true;
  if (value === 'No') return false;
  throw new Error(`Row ${row.row}, ${column}: expected Yes or No, got ${value}`);
}

function lksgRisk(row: SupplierRow): RatingRecord['lksgCountryRisk'] {
  const value = text(row, 'lksg_country_risk');
  if (value === null || value === 'Low' || value === 'Medium' || value === 'High') {
    return value;
  }
  throw new Error(`Row ${row.row}, lksg_country_risk: unknown value ${value}`);
}

function provenance(row: SupplierRow, assumedFields: string[] = []): SourceProvenance {
  return {
    file: row.file ?? SOURCE_FILE,
    sheet: row.sheet ?? SOURCE_SHEET,
    row: row.row,
    assumedFields: [...(row.assumed ?? []), ...assumedFields],
  };
}

export const ASSUMPTIONS_FILE = 'data/assumptions.json';
const DATE_COLUMNS = ['contract_start', 'contract_end', 'last_quote_date', 'last_updated'];

/** New fictitious suppliers from the assumptions, in the same shape as Excel rows. */
export function extraRows(assumptions: Assumptions): SupplierRow[] {
  return assumptions.extraSuppliers.rows.map((raw, i) => {
    const values: Record<string, unknown> = { ...raw };
    for (const column of DATE_COLUMNS) {
      const v = values[column];
      if (typeof v === 'string') values[column] = new Date(`${v}T00:00:00Z`);
    }
    return { row: i + 1, values, file: ASSUMPTIONS_FILE, sheet: 'extraSuppliers.rows' };
  });
}

/** Applies "overrides" and remembers which columns were changed. */
export function applyOverrides(rows: SupplierRow[], assumptions: Assumptions): SupplierRow[] {
  return rows.map((row) => {
    const override = assumptions.overrides[String(row.values['supplier_id'])];
    if (!override) return row;
    const values: Record<string, unknown> = { ...override.values };
    for (const column of DATE_COLUMNS) {
      const v = values[column];
      if (typeof v === 'string') values[column] = new Date(`${v}T00:00:00Z`);
    }
    return {
      ...row,
      values: { ...row.values, ...values },
      assumed: [...(row.assumed ?? []), ...Object.keys(override.values)],
    };
  });
}

function toErp(row: SupplierRow, supplierId: string): ErpRecord {
  return {
    recordId: `ERP-${supplierId}`,
    system: 'erp',
    supplierId,
    notice: DEMO_DATA_NOTICE,
    provenance: provenance(row),
    supplierName: requiredText(row, 'supplier_name'),
    country: requiredText(row, 'country'),
    city: requiredText(row, 'city'),
    category: requiredText(row, 'category'),
    products: requiredText(row, 'products'),
    relationshipStatus: requiredText(row, 'relationship_status'),
    contractStart: date(row, 'contract_start'),
    contractEnd: date(row, 'contract_end'),
    lastQuoteDate: date(row, 'last_quote_date'),
    annualSpendEur: num(row, 'annual_spend_eur'),
    priceIndex: num(row, 'price_index'),
    leadTimeDays: num(row, 'lead_time_days'),
    onTimeDeliveryPercent: percent(row, 'on_time_delivery_pct'),
    complaintRatePercent: percent(row, 'defect_rate_pct'),
    lastUpdated: date(row, 'last_updated'),
    vatId: text(row, 'vat_id'),
    erpId: text(row, 'erp_id'),
  };
}

function toRating(row: SupplierRow, supplierId: string): RatingRecord {
  return {
    recordId: `RAT-${supplierId}`,
    system: 'ratings',
    supplierId,
    notice: DEMO_DATA_NOTICE,
    provenance: provenance(row),
    sustainabilityScore: num(row, 'ecovadis_score'),
    certifications: text(row, 'certifications'),
    sbtiTarget: yesNo(row, 'sbti_target'),
    lksgCountryRisk: lksgRisk(row),
    controversies: text(row, 'controversies'),
    lastUpdated: date(row, 'last_updated'),
    infoRequestStatus: text(row, 'info_request_status'),
    co2DataSource: text(row, 'data_source'),
    sustainabilityReport: yesNo(row, 'sustainability_report'),
  };
}

/** Average CO2 intensity of a category, over the Excel rows only. */
export function categoryAverageIntensity(rows: SupplierRow[], category: string): number {
  const values = rows
    .filter((r) => !r.file && r.values['category'] === category && !r.assumed?.includes('category'))
    .map((r) => r.values['co2_intensity_kg_per_eur'])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) throw new Error(`No CO2 intensity for category ${category}`);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Estimated PCF: reference x supplier intensity / category average, one decimal. */
export function estimatePcf(referenceKgPerPiece: number, intensity: number, averageIntensity: number): number {
  // One decimal for parts of several kilograms, two for small parts (seals, bearings).
  const kg = (referenceKgPerPiece * intensity) / averageIntensity;
  return kg < 5 ? Math.round(kg * 100) / 100 : Math.round(kg * 10) / 10;
}

function toPcf(
  row: SupplierRow,
  supplierId: string,
  part: PartAssumptions,
  /** Only called for estimated values. */
  averageIntensityOf: () => number,
): PcfRecord | null {
  const pcf = part.pcf[supplierId];
  if (!pcf) return null;
  const referenceDate = date(row, 'last_updated');
  if (referenceDate === null) {
    throw new Error(`${supplierId}: PCF needs a reference date (last_updated is empty)`);
  }
  const base = {
    recordId: `PCF-${supplierId}-${part.partId}`,
    system: 'pcf' as const,
    supplierId,
    notice: DEMO_DATA_NOTICE,
    partId: part.partId,
    referenceDate,
    boundary: null,
    referenceYear: null,
    primaryDataSharePercent: null,
    assurance: null,
    source: null,
  };
  // Assumptions: "actual" = a value stated by the supplier; "estimated" = company intensity x reference value.
  if (pcf.badge === 'actual') {
    return {
      ...base,
      provenance: provenance(row, ['partId', 'pcfKgPerPiece', 'badge', 'method']),
      pcfKgPerPiece: pcf.pcfKgPerPiece,
      badge: 'Supplier-specific',
      method: pcf.method,
    };
  }
  const intensity = num(row, 'co2_intensity_kg_per_eur');
  if (intensity === null) throw new Error(`${supplierId}: an estimated PCF needs co2_intensity_kg_per_eur`);
  const reference = part.pcfEstimate.referenceKgPerPiece;
  const averageIntensity = averageIntensityOf();
  return {
    ...base,
    provenance: provenance(row, ['partId', 'badge', 'method', 'pcfKgPerPiece (reference value)']),
    pcfKgPerPiece: estimatePcf(reference, intensity, averageIntensity),
    badge: 'Company estimate',
    method:
      `Estimate: reference ${reference} kg CO2e per piece x CO2 intensity ${intensity} / ` +
      `category average ${averageIntensity.toFixed(3)} kg CO2e per EUR (placeholder reference, fictitious)`,
  };
}

/** Unit price from the price index: base price x index / 100, rounded to cents. */
export function unitPriceFromIndex(basePriceEur: number, priceIndex: number): number {
  return Math.round(basePriceEur * priceIndex) / 100;
}

function toOffer(row: SupplierRow, erp: ErpRecord, part: PartAssumptions): Offer | null {
  const offer = part.offers[erp.supplierId];
  if (!offer) return null;
  if (erp.priceIndex === null) {
    throw new Error(`${erp.supplierId}: an offer needs a price index`);
  }
  return {
    offerId: `OFF-${erp.supplierId}-${part.partId}`,
    supplierId: erp.supplierId,
    partId: part.partId,
    partName: part.partName,
    quantity: part.quantity,
    unitPriceEur: unitPriceFromIndex(part.basePriceEurAtIndex100.value, erp.priceIndex),
    priceDate: offer.priceDate,
    validUntil: offer.validUntil,
    leadTimeDays: erp.leadTimeDays,
    priceType: offer.priceType,
    sourceDocumentId: `DOC-OFFER-${erp.supplierId}-${part.partId}`,
    notice: DEMO_DATA_NOTICE,
    // Only the price index and the lead time come from the Excel.
    provenance: provenance(row, [
      'partId',
      'partName',
      'quantity',
      'unitPriceEur',
      'priceDate',
      'validUntil',
      'priceType',
      'sourceDocumentId',
    ]),
  };
}

/**
 * Purchase orders from the assumptions. Price and CO2 come from the records
 * already built, so a gap fails the build instead of inventing a value.
 */
/** Company-level emissions from Excel columns the cockpit did not use before (rating partner, CSRD style). */
function toCompanyEmissions(row: SupplierRow, supplierId: string): CompanyEmissionsRecord {
  const updated = date(row, 'last_updated');
  return {
    supplierId,
    reportingYear: (updated ? Number(updated.slice(0, 4)) : 2026) - 1,
    scope12Tonnes: num(row, 'co2_scope1_2_t'),
    intensityKgPerEur: num(row, 'co2_intensity_kg_per_eur'),
    renewableEnergyPercent: percent(row, 'renewable_energy_pct'),
    transportDistanceKm: num(row, 'transport_distance_km'),
    dataCompletenessPercent: percent(row, 'data_completeness_pct'),
    dataSource: text(row, 'data_source'),
  };
}

type HistoryOrder = NonNullable<Assumptions['purchaseHistory']>['orders'][number] & { generated?: boolean };

/**
 * The client ERP holds more than two quarters: from January 2025 each product was ordered
 * monthly from the supplier of Q2 2026, with seasonal quantities. Q2 and Q3 2026 stay as in
 * assumptions.json, so the start-page statistics do not change.
 */
function withEarlierOrders(orders: HistoryOrder[]): HistoryOrder[] {
  const earliest = new Map<string, HistoryOrder>();
  for (const o of orders) {
    const known = earliest.get(o.partId);
    if (!known || o.orderDate < known.orderDate) earliest.set(o.partId, o);
  }
  const earlier: HistoryOrder[] = [];
  let n = 11001;
  for (const template of earliest.values()) {
    const day = template.orderDate.slice(8, 10);
    for (let month = '2025-01'; month < template.orderDate.slice(0, 7); month = addMonths(month, 1)) {
      const factor = 0.85 + 0.25 * hash(`${template.partId}${month}`);
      earlier.push({
        ...template,
        poNumber: `PO-45000${n++}`,
        orderDate: `${month}-${day}`,
        quantity: Math.round((template.quantity * factor) / 50) * 50,
        cockpitDecisionId: null,
        replacedSupplierId: undefined,
        generated: true,
      });
    }
  }
  return [...earlier.sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.partId.localeCompare(b.partId)), ...orders];
}

function toPurchaseOrders(dataset: DemoDataset, assumptions: Assumptions): PurchaseOrderRecord[] {
  return withEarlierOrders(assumptions.purchaseHistory?.orders ?? []).map((order, i) => {
    const where = `purchaseHistory.orders[${i}] (${order.poNumber})`;
    const part = assumptions.parts.find((p) => p.partId === order.partId);
    const erp = dataset.erp.find((e) => e.supplierId === order.supplierId);
    const pcf = dataset.pcf.find((p) => p.supplierId === order.supplierId && p.partId === order.partId);
    if (!part) throw new Error(`${where}: unknown part ${order.partId}`);
    if (!erp || erp.priceIndex === null) throw new Error(`${where}: ${order.supplierId} needs an ERP record with a price index`);
    if (!pcf) throw new Error(`${where}: no PCF record for ${order.supplierId} and ${order.partId}`);
    let replacedPcf: PcfRecord | undefined;
    let replacedPrice: number | null = null;
    if (order.replacedSupplierId) {
      const replacedErp = dataset.erp.find((e) => e.supplierId === order.replacedSupplierId);
      if (!replacedErp || replacedErp.priceIndex === null) {
        throw new Error(`${where}: the replaced supplier ${order.replacedSupplierId} needs a price index`);
      }
      replacedPrice = unitPriceFromIndex(part.basePriceEurAtIndex100.value, replacedErp.priceIndex);
      replacedPcf = dataset.pcf.find((p) => p.supplierId === order.replacedSupplierId && p.partId === order.partId);
      if (!replacedPcf) throw new Error(`${where}: no PCF record for the replaced supplier ${order.replacedSupplierId}`);
    }
    return {
      recordId: order.poNumber,
      system: 'erp',
      supplierId: order.supplierId,
      notice: DEMO_DATA_NOTICE,
      provenance: {
        file: ASSUMPTIONS_FILE,
        sheet: order.generated ? 'purchaseHistory (earlier months, generated from the Q2 2026 order)' : 'purchaseHistory.orders',
        row: i + 1,
        assumedFields: ['poNumber', 'orderDate', 'quantity', 'cockpitDecisionId', 'replacedSupplierId'],
      },
      poNumber: order.poNumber,
      orderDate: order.orderDate,
      partId: part.partId,
      partName: part.partName,
      quantity: order.quantity,
      unitPriceEur: unitPriceFromIndex(part.basePriceEurAtIndex100.value, erp.priceIndex),
      pcfKgPerPiece: pcf.pcfKgPerPiece,
      pcfBadge: pcf.badge,
      pcfRecordId: pcf.recordId,
      cockpitDecisionId: order.cockpitDecisionId,
      replacedSupplierId: order.replacedSupplierId ?? null,
      replacedPcfKgPerPiece: replacedPcf?.pcfKgPerPiece ?? null,
      replacedUnitPriceEur: replacedPrice,
    };
  });
}

const BADGES = ['Verified', 'Supplier-specific', 'Company estimate', 'Industry average'] as const;

function isoDate(value: unknown, where: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`${where}: expected a date, got ${String(value)}`);
  return value.toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Default weights of a category from Excel v2: the prototype keeps four criteria
 * (decision of 8 Nov 2026), so "performance" is dropped and the rest is scaled
 * to whole percent that add up to 100 (largest remainder).
 */
export function categoryWeights(row: SupplierRow): { quality: number; price: number; co2: number; delivery: number } {
  const raw = {
    quality: Number(row.values['w_quality']),
    price: Number(row.values['w_price']),
    co2: Number(row.values['w_sustainability']),
    delivery: Number(row.values['w_delivery']),
  };
  const sum = raw.quality + raw.price + raw.co2 + raw.delivery;
  if (!(sum > 0)) throw new Error(`Categories row ${row.row}: weights missing`);
  const keys = ['quality', 'price', 'co2', 'delivery'] as const;
  const exact = keys.map((k) => (raw[k] / sum) * 100);
  const out = exact.map((x) => Math.floor(x));
  let left = 100 - out.reduce((a, b) => a + b, 0);
  for (const i of exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (left-- <= 0) break;
    out[i]! += 1;
  }
  return { quality: out[0]!, price: out[1]!, co2: out[2]!, delivery: out[3]! };
}

const V2_FILE = SOURCE_FILE;

/** Offers and PCF records of a part from the Excel v2 demo case sheets ("Offers", "PCF", "Sources"). */
function demoCaseRecords(part: PartAssumptions, v2: DemoCaseSheets, erpOf: (id: string) => ErpRecord): { offers: Offer[]; pcf: PcfRecord[] } {
  const quantity = Number(v2.request['quantity_units'] ?? part.quantity);
  const offers: Offer[] = v2.offers.map((r) => {
    const where = `Offers row ${r.row} (${String(r.values['offer_id'])})`;
    const supplierId = String(r.values['supplier_id']);
    const priceDate = isoDate(r.values['quote_date'], where);
    const price = Number(r.values['price_per_unit_eur']);
    if (!(price > 0)) throw new Error(`${where}: price missing`);
    const lead = r.values['lead_time_days'];
    return {
      offerId: String(r.values['offer_id']),
      supplierId,
      partId: part.partId,
      partName: part.partName,
      quantity,
      unitPriceEur: Math.round(price * 100) / 100,
      priceDate,
      // Excel v2 has no validity; assumption: 60 days from the quote.
      validUntil: plusDays(priceDate, 60),
      leadTimeDays: typeof lead === 'number' ? lead : null,
      priceType: 'firm',
      sourceDocumentId: `DOC-OFFER-${supplierId}-${part.partId}`,
      notice: DEMO_DATA_NOTICE,
      provenance: { file: V2_FILE, sheet: 'Offers', row: r.row, assumedFields: ['partId', 'validUntil', 'priceType', 'sourceDocumentId'] },
    };
  });
  const pcf: PcfRecord[] = v2.pcf.map((r) => {
    const where = `PCF row ${r.row} (${String(r.values['pcf_id'])})`;
    const supplierId = String(r.values['supplier_id']);
    const badge = String(r.values['badge']) as PcfRecord['badge'];
    if (!BADGES.includes(badge)) throw new Error(`${where}: unknown badge ${badge}`);
    const kg = Number(r.values['kg_co2e_per_unit']);
    if (!(kg > 0)) throw new Error(`${where}: kg CO2e missing`);
    const year = Number(r.values['reference_year']);
    const src = v2.sources.find((s) => s.values['source_id'] === r.values['source_id']);
    const share = r.values['primary_data_share'];
    const retrievedOn = src?.values['retrieved_on'] instanceof Date ? isoDate(src.values['retrieved_on'], where) : null;
    // End of the reference year, but never after the day the source was retrieved (no future dates).
    const yearEnd = `${year}-12-31`;
    const referenceDate = retrievedOn && retrievedOn < yearEnd ? retrievedOn : yearEnd;
    erpOf(supplierId); // the supplier must exist
    return {
      recordId: `PCF-${supplierId}-${part.partId}`,
      system: 'pcf',
      supplierId,
      notice: DEMO_DATA_NOTICE,
      provenance: { file: V2_FILE, sheet: 'PCF', row: r.row, assumedFields: ['referenceDate (end of reference year, at most the retrieval date)'] },
      partId: part.partId,
      pcfKgPerPiece: Math.round(kg * 10) / 10,
      badge,
      referenceDate,
      method: `${String(r.values['boundary'] ?? 'Boundary not stated')}, declared unit ${String(r.values['declared_unit'] ?? '1 piece')}`,
      boundary: r.values['boundary'] ? String(r.values['boundary']) : null,
      referenceYear: Number.isFinite(year) ? year : null,
      primaryDataSharePercent: typeof share === 'number' ? Math.round(share * 100) : null,
      assurance: r.values['assurance'] ? String(r.values['assurance']) : null,
      source: src
        ? {
            sourceId: String(src.values['source_id']),
            sourceType: String(src.values['source_type'] ?? ''),
            link: src.values['link'] ? String(src.values['link']) : null,
            retrievedOn,
            match: src.values['match'] === 'Sure' || src.values['match'] === 'Uncertain' ? src.values['match'] : null,
            note: src.values['source_note'] ? String(src.values['source_note']) : null,
          }
        : null,
    };
  });
  return { offers, pcf };
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const eur = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 0 });

/**
 * Weakest and best quality and delivery among our current suppliers (active contract) of the category:
 * the score range of suppliers that never delivered (ranked by the weakest, so a gap never beats real data).
 */
function newSupplierAssumption(part: PartAssumptions, dataset: DemoDataset): NewSupplierAssumption | null {
  const current = dataset.erp.filter(
    (e) => e.category === part.category && e.relationshipStatus === 'Active contract' && e.complaintRatePercent !== null && e.onTimeDeliveryPercent !== null,
  );
  if (current.length === 0) return null;
  return {
    quality: Math.max(...current.map((e) => e.complaintRatePercent!)),
    delivery: Math.min(...current.map((e) => e.onTimeDeliveryPercent!)),
    qualityBest: Math.min(...current.map((e) => e.complaintRatePercent!)),
    deliveryBest: Math.max(...current.map((e) => e.onTimeDeliveryPercent!)),
    peers: current.length,
  };
}

/**
 * The four reference values of a part: what we have today (decision of 17 Nov 2026, model B),
 * as the average of the last three purchases of the part in the client ERP:
 * - price: their average unit price; current contract, budget or category average as fallback
 * - quality and delivery: the ERP values of the suppliers of those orders (without orders: the current supplier); category average as fallback
 * - CO₂: their product footprints (PCF exchange); the published industry average as fallback
 * The published industry average is no longer scored; it is returned separately as context (see industryCo2).
 * Null when a part has no CO₂ benchmark configured or the ERP has no values for its category.
 */
/** Published industry average CO₂ per piece (material only): context next to the score, not scored (17 Nov 2026). */
function industryCo2(part: PartAssumptions, factors: PublicBenchmarkFactor[]): Benchmark | null {
  const config = part.co2Benchmark;
  const factor = factors.find((f) => f.factorId === config?.factorId);
  if (!config || !factor) return null;
  const value = factor.valueKgCo2ePerKg * config.materialKgPerPiece;
  return {
    value: round(value, value < 5 ? 2 : 1),
    basis: `${factor.publisher}, ${factor.referenceYear}: ${factor.valueKgCo2ePerKg} kg ${factor.gas} per kg ${factor.material.toLowerCase()} × ${config.materialKgPerPiece} kg per piece (material only)`,
    // Short source for the table: the abbreviation in brackets (IAI, ICA), else the name before them (OEKOBAUDAT).
    short: `${((a) => (a && a.length <= 12 ? a : factor.publisher.split(' (')[0]))(/\(([^)]+)\)/.exec(factor.publisher)?.[1])} ${factor.referenceYear}`,
    kind: 'official',
    sourceUrl: factor.url,
  };
}

function partBenchmarks(part: PartAssumptions, dataset: DemoDataset, factors: PublicBenchmarkFactor[], v2?: DemoCaseSheets): Benchmarks | null {
  const industry = industryCo2(part, factors);
  if (!industry) return null;
  const peers = dataset.erp.filter((e) => e.category === part.category);
  const complaints = peers.map((e) => e.complaintRatePercent).filter((v): v is number => v !== null);
  const onTime = peers.map((e) => e.onTimeDeliveryPercent).filter((v): v is number => v !== null);
  if (complaints.length === 0 || onTime.length === 0) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const category = part.category;

  // Price: what we pay today, i.e. the last purchase price in the client ERP (purchase price variance,
  // decision of 8 Nov 2026). Without orders: the budget of the request, else the category average price.
  // Today = the last three purchases of the part (decision of 17 Nov 2026), so one unusual order does not set the yardstick.
  const lastOrders = [...dataset.purchaseOrders].filter((o) => o.partId === part.partId).sort((a, b) => a.orderDate.localeCompare(b.orderDate)).slice(-3);
  const budget = part.fromExcelV2 ? Number(v2?.request['budget_eur']) : NaN;
  const quantity = part.fromExcelV2 ? Number(v2?.request['quantity_units']) : NaN;
  const supplierName = (id: string) => dataset.erp.find((e) => e.supplierId === id)?.supplierName ?? id;
  const currentOffer = dataset.offers.find((o) => o.partId === part.partId && o.supplierId === part.currentSupplierId);
  const orderSuppliers = [...new Set(lastOrders.map((o) => supplierName(o.supplierId)))].join(', ');
  const ordersText = `last ${lastOrders.length} ${lastOrders.length === 1 ? 'purchase' : 'purchases'}: ${lastOrders.map((o) => o.poNumber).join(', ')}, ${orderSuppliers}`;
  const price = lastOrders.length
    ? {
        value: round(avg(lastOrders.map((o) => o.unitPriceEur)), 2),
        short: 'Price today',
        basis: `Price we pay today: EUR ${avg(lastOrders.map((o) => o.unitPriceEur)).toFixed(2)} per piece, average of the ${ordersText} (client ERP)`,
      }
    : currentOffer
      ? {
          value: currentOffer.unitPriceEur,
          short: 'Price today',
          basis: `Price we pay today: EUR ${currentOffer.unitPriceEur.toFixed(2)} per piece to ${supplierName(currentOffer.supplierId)} (current contract, client ERP)`,
        }
      : budget > 0 && quantity > 0
      ? { value: round(budget / quantity, 2), short: 'Budget', basis: `Budget of the request: EUR ${eur(budget)} for ${eur(quantity)} pcs (Excel v2)` }
      : {
          value: part.basePriceEurAtIndex100.value,
          short: 'Category average',
          basis: `Average price in the category ${category}: price index 100 = EUR ${part.basePriceEurAtIndex100.value.toFixed(2)} (assumption)`,
        };

  // Quality, delivery and CO₂: the average over the suppliers of the last three purchases (one value per order);
  // without orders the current supplier; without any value the category average (CO₂: the industry average).
  const today = (value: number, basis: string): Benchmark => ({ value, basis, short: 'Today', kind: 'internal', sourceUrl: null });
  const current = dataset.erp.find((e) => e.supplierId === part.currentSupplierId);
  const fromSuppliers = lastOrders.length ? lastOrders.map((o) => o.supplierId) : [part.currentSupplierId];
  const where = lastOrders.length ? `the ${ordersText}` : `the current supplier ${current?.supplierName ?? part.currentSupplierId}`;
  const valuesOf = (pick: (id: string) => number | null | undefined) =>
    fromSuppliers.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const erpOf = (id: string) => dataset.erp.find((e) => e.supplierId === id);
  const ownComplaints = valuesOf((id) => erpOf(id)?.complaintRatePercent);
  const ownOnTime = valuesOf((id) => erpOf(id)?.onTimeDeliveryPercent);
  const ownCo2 = valuesOf((id) => dataset.pcf.find((p) => p.partId === part.partId && p.supplierId === id)?.pcfKgPerPiece);

  return {
    quality: ownComplaints.length
      ? today(round(avg(ownComplaints), 2), `Complaint rate of ${where} (client ERP)`)
      : { value: round(avg(complaints), 2), basis: `No value of today's supplier: average complaint rate of our ${complaints.length} suppliers in ${category} (client ERP)`, short: 'Our suppliers', kind: 'internal', sourceUrl: null },
    price: { ...price, kind: 'internal', sourceUrl: null },
    co2: ownCo2.length
      ? today(round(avg(ownCo2), ownCo2[0]! < 5 ? 2 : 1), `Product footprint of ${where} (PCF exchange)`)
      : { ...industry, basis: `No value of today's supplier: ${industry.basis}` },
    delivery: ownOnTime.length
      ? today(round(avg(ownOnTime), 1), `On-time delivery of ${where} (client ERP)`)
      : { value: round(avg(onTime), 1), basis: `No value of today's supplier: average on-time delivery of our ${onTime.length} suppliers in ${category} (client ERP)`, short: 'Our suppliers', kind: 'internal', sourceUrl: null },
  };
}

/**
 * Builds the dataset: ERP and rating records for every supplier (suppliers page),
 * offers, PCF values and documents only for the demo suppliers in the assumptions.
 * With Excel v2 the part marked "fromExcelV2" (the GH-200 demo case) comes from its sheets.
 */
export function buildDataset(
  rows: SupplierRow[],
  assumptions: Assumptions,
  v2?: DemoCaseSheets,
  publicBenchmarks: PublicBenchmarkFactor[] = [],
): DemoDataset {
  const dataset: DemoDataset = {
    notice: DEMO_DATA_NOTICE,
    generatedFrom: SOURCE_FILE,
    erp: [],
    ratings: [],
    pcf: [],
    offers: [],
    documents: [],
    purchaseOrders: [],
    purchaseRequisitions: [],
    exampleDecisions: [],
    publicBenchmarks,
    supplierPerformance: [],
    ratingHistory: [],
    certificates: [],
    companyEmissions: [],
    riskAlerts: [],
    settings: {
      catalog: assumptions.catalog.map((c) => {
        const part = assumptions.parts.find((p) => p.partId === c.partId);
        return {
          ...c,
          hasOffers: part !== undefined,
          defaultQuantity: part?.quantity ?? null,
          currentSupplierId: part?.currentSupplierId ?? null,
          defaultWeights: (() => {
            const row = v2?.categories.find((r) => r.values['category'] === c.category);
            return row ? categoryWeights(row) : null;
          })(),
          defaultNeededBy:
            part?.fromExcelV2 && v2?.request['due_date'] instanceof Date ? isoDate(v2.request['due_date'], 'Demo Request due_date') : null,
          benchmarks: null,
          industryCo2: null,
          newSupplierAssumption: null,
        };
      }),
      defaultQuantity: assumptions.parts[0]?.quantity ?? 1000,
      co2PricePerTonneEur: assumptions.co2PricePerTonneEur.value,
      co2PriceToConfirm: assumptions.co2PricePerTonneEur.toConfirm,
      priceMaxAgeDays: assumptions.priceMaxAgeDays.value,
      co2MaxAgeDays: assumptions.co2MaxAgeDays.value,
      buyers: assumptions.buyers?.list ?? [],
      defaultCo2Targets: assumptions.co2Targets
        ? { company: assumptions.co2Targets.company, buyers: assumptions.co2Targets.buyers, groups: assumptions.co2Targets.groups }
        : { company: 1, buyers: {}, groups: {} },
    },
  };
  for (const part of assumptions.parts) {
    if (!assumptions.catalog.some((c) => c.partId === part.partId)) {
      throw new Error(`Part ${part.partId} must be in the catalog`);
    }
    if (part.fromExcelV2) {
      if (!v2) throw new Error(`${part.partId}: needs the Excel v2 demo case sheets`);
      continue;
    }
    if (!part.offers[part.currentSupplierId]) {
      throw new Error(`${part.partId}: the current supplier ${part.currentSupplierId} needs an offer`);
    }
    for (const supplierId of [...Object.keys(part.offers), ...Object.keys(part.pcf)]) {
      if (!assumptions.demoSupplierIds.includes(supplierId)) {
        throw new Error(`${part.partId}: ${supplierId} must be listed in demoSupplierIds`);
      }
    }
  }

  const allRows = applyOverrides([...rows, ...extraRows(assumptions)], assumptions);
  const averageIntensity = (category: string) => categoryAverageIntensity(allRows, category);

  for (const supplierId of assumptions.demoSupplierIds) {
    const matches = allRows.filter((r) => r.values['supplier_id'] === supplierId);
    if (matches.length !== 1) {
      throw new Error(`${supplierId}: expected exactly one row in the Excel, found ${matches.length}`);
    }
    const row = matches[0]!;
    const erp = toErp(row, supplierId);
    dataset.erp.push(erp);
    dataset.ratings.push(toRating(row, supplierId));
    dataset.companyEmissions.push(toCompanyEmissions(row, supplierId));
    for (const part of assumptions.parts) {
      if (part.fromExcelV2) continue;
      const pcf = toPcf(row, supplierId, part, () => averageIntensity(part.category));
      if (pcf) dataset.pcf.push(pcf);
      const offer = toOffer(row, erp, part);
      if (offer) {
        dataset.offers.push(offer);
        dataset.documents.push(offerDocument(offer, erp));
      }
    }
    const fine = assumptions.fineNotices[supplierId];
    if (fine) dataset.documents.push(fineNoticeDocument(row, erp, fine));
  }

  // The Excel v2 demo case (GH-200): offers, PCF records and offer PDFs from its sheets.
  for (const part of assumptions.parts.filter((p) => p.fromExcelV2)) {
    const erpOf = (id: string) => {
      const erp = dataset.erp.find((e) => e.supplierId === id);
      if (!erp) throw new Error(`${part.partId}: ${id} must be listed in demoSupplierIds`);
      return erp;
    };
    const { offers, pcf } = demoCaseRecords(part, v2!, erpOf);
    if (!offers.some((o) => o.supplierId === part.currentSupplierId)) {
      throw new Error(`${part.partId}: the current supplier ${part.currentSupplierId} needs an offer`);
    }
    dataset.pcf.push(...pcf);
    for (const offer of offers) {
      dataset.offers.push(offer);
      dataset.documents.push(offerDocument(offer, erpOf(offer.supplierId)));
    }
  }

  // All other suppliers: master data and rating only (decision of 6 Nov 2026).
  const demo = new Set(assumptions.demoSupplierIds);
  for (const row of allRows) {
    const supplierId = requiredText(row, 'supplier_id');
    if (demo.has(supplierId)) continue;
    dataset.erp.push(toErp(row, supplierId));
    dataset.ratings.push(toRating(row, supplierId));
    dataset.companyEmissions.push(toCompanyEmissions(row, supplierId));
  }
  dataset.purchaseOrders = toPurchaseOrders(dataset, assumptions);

  const byId = (x: { supplierId: string }, y: { supplierId: string }) => x.supplierId.localeCompare(y.supplierId);
  dataset.erp.sort(byId);
  dataset.ratings.sort(byId);
  // Benchmarks need all suppliers of a category, so they come after the ERP records.
  for (const entry of dataset.settings.catalog) {
    const part = assumptions.parts.find((p) => p.partId === entry.partId);
    entry.benchmarks = part ? partBenchmarks(part, dataset, publicBenchmarks, v2) : null;
    entry.industryCo2 = part && entry.benchmarks ? industryCo2(part, publicBenchmarks) : null;
    entry.newSupplierAssumption = part ? newSupplierAssumption(part, dataset) : null;
  }
  dataset.exampleDecisions = buildExampleDecisions(dataset, assumptions);
  // PDFs real systems would hold: order PDFs, scorecards, PCF data sheets (decision of 8 Nov 2026).
  // A scorecard without an assessment date gets the demo date (assumption, listed in assumedFields).
  // History around the Excel values, as the client's systems would hold it (decision of 8 Nov 2026).
  dataset.supplierPerformance = supplierPerformance(dataset);
  dataset.ratingHistory = ratingHistory(dataset);
  dataset.certificates = certificates(dataset);
  addSupportingDocuments(dataset, Object.fromEntries(dataset.settings.catalog.map((c) => [c.partId, c.partName])), DEMO_DATE);
  dataset.riskAlerts = riskAlerts(dataset);
  dataset.purchaseRequisitions = purchaseRequisitions(dataset);

  return dataset;
}
