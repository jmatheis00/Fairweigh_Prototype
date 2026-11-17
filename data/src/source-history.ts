import type {
  CertificateRecord,
  DemoDataset,
  RatingHistoryEntry,
  RiskAlert,
  SupplierPerformanceMonth,
} from '@scc/shared';

/**
 * History around the Excel v2 values, as the client's systems would hold it
 * (decision of 8 Nov 2026). Deterministic: the same input always gives the same
 * data. The Excel stays the truth for the current values:
 * - the ERP's on-time % and complaint rate are exactly the sums of the last 12 months below,
 * - the current rating score is the Excel score,
 * - certificates are the ones the Excel lists,
 * - risk alerts only restate facts from the other systems; no new allegation is invented.
 */

/** Demo date the data refers to. */
export const DEMO_DATE = '2026-11-06';
/** Last complete month of ERP data (the purchase history ends in Q3 2026). */
export const LAST_MONTH = '2026-09';
/** First month of the 24-month ERP history. */
export const FIRST_MONTH = '2024-10';

/** Deterministic number in [0, 1) from a text (FNV-1a with a final mix). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Final mix (MurmurHash3 fmix32), so texts that differ only at the end still spread over [0, 1).
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

export function addMonths(month: string, n: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Splits a whole number into parts proportional to the weights (largest remainder), so the parts add up exactly. */
export function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (sum > 0 ? (total * w) / sum : total / weights.length));
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i]! += 1;
    left -= 1;
  }
  return parts;
}

/** Seasonality of industrial demand: quieter in August and December. */
const SEASON = [1.0, 1.02, 1.06, 1.04, 1.03, 0.98, 0.95, 0.8, 1.05, 1.07, 1.04, 0.86];
const season = (month: string) => SEASON[Number(month.slice(5, 7)) - 1]!;

/** Deliveries per 12 months in the vendor evaluation; 1,000 makes one-decimal KPIs exact. */
const DELIVERIES_PER_YEAR = 1000;

function twelveMonths(supplierId: string, end: string, onTimePct: number, complaintPct: number, spendEur: number | null) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(end, i - 11));
  const weights = months.map((m) => season(m) * (0.9 + 0.2 * hash(`${supplierId}${m}w`)));
  const deliveries = split(DELIVERIES_PER_YEAR, weights);
  // Split the late deliveries (few), so no month can have more on-time deliveries than deliveries.
  const late = split(DELIVERIES_PER_YEAR - Math.round((onTimePct / 100) * DELIVERIES_PER_YEAR), deliveries.map((d, i) => d * (0.5 + hash(`${supplierId}${months[i]}o`))));
  const onTime = deliveries.map((d, i) => d - Math.min(late[i]!, d));
  const notifications = split(Math.round((complaintPct / 100) * DELIVERIES_PER_YEAR), weights.map((w, i) => w * hash(`${supplierId}${months[i]}q`)));
  const spend = split(Math.round(spendEur ?? 0), weights);
  return months.map((month, i) => ({
    supplierId,
    month,
    deliveries: deliveries[i]!,
    onTimeDeliveries: onTime[i]!,
    qualityNotifications: notifications[i]!,
    spendEur: spend[i]!,
  }));
}

/**
 * Vendor evaluation per month for suppliers with deliveries (active and former contracts).
 * The last 12 months reproduce the Excel KPIs exactly; the 12 months before drift a little,
 * mostly worse, so most suppliers show an improving trend.
 */
export function supplierPerformance(d: DemoDataset): SupplierPerformanceMonth[] {
  const rows: SupplierPerformanceMonth[] = [];
  for (const e of d.erp) {
    if (e.onTimeDeliveryPercent === null || e.complaintRatePercent === null) continue;
    const contractEnd = e.contractEnd?.slice(0, 7) ?? null;
    const end = e.relationshipStatus === 'Former supplier' && contractEnd && contractEnd < LAST_MONTH ? contractEnd : LAST_MONTH;
    const id = e.supplierId;
    const driftOnTime = Math.round((hash(`${id}d`) - 0.7) * 8);
    const prevOnTime = Math.max(60, Math.min(100, e.onTimeDeliveryPercent + driftOnTime));
    const prevComplaints = Math.round(e.complaintRatePercent * (1 + (hash(`${id}c`) - 0.3) * 0.6) * 10) / 10;
    const prevSpend = e.annualSpendEur === null ? null : e.annualSpendEur * (0.85 + 0.25 * hash(`${id}s`));
    const all = [
      ...twelveMonths(id, addMonths(end, -12), prevOnTime, prevComplaints, prevSpend),
      ...twelveMonths(id, end, e.onTimeDeliveryPercent, e.complaintRatePercent, e.annualSpendEur),
    ];
    // Active suppliers: the 24 months up to the last complete month. Former suppliers: their last 24 months before the contract ended.
    const former = e.relationshipStatus === 'Former supplier';
    rows.push(...all.filter((r) => r.month <= LAST_MONTH && (former || r.month >= FIRST_MONTH)));
  }
  return rows;
}

/** Rating per assessment year (current plus up to three earlier); the current one is the Excel score. Most suppliers improved over time. */
export function ratingHistory(d: DemoDataset): RatingHistoryEntry[] {
  const out: RatingHistoryEntry[] = [];
  for (const r of d.ratings) {
    if (r.sustainabilityScore === null) continue;
    const assessed = r.lastUpdated ?? DEMO_DATE;
    const lastYear = Number(assessed.slice(0, 4));
    let score = r.sustainabilityScore;
    // The current assessment plus up to three earlier ones, never before 2021.
    for (let year = lastYear; year >= Math.max(2021, lastYear - 3); year--) {
      out.push({ supplierId: r.supplierId, year, score, assessedOn: `${year}${assessed.slice(4)}` });
      score = Math.max(0, Math.min(100, score - Math.round((hash(`${r.supplierId}${year}`) - 0.3) * 8)));
    }
  }
  return out.sort((a, b) => a.supplierId.localeCompare(b.supplierId) || a.year - b.year);
}

/** Certificates the Excel lists, with a three-year validity; a few expire soon. */
export function certificates(d: DemoDataset): CertificateRecord[] {
  const out: CertificateRecord[] = [];
  for (const r of d.ratings) {
    for (const standard of (r.certifications ?? '').split(/;\s*/).map((s) => s.trim()).filter(Boolean)) {
      const validUntil = addDays(DEMO_DATE, 20 + Math.floor(hash(`${r.supplierId}${standard}`) * 1000));
      out.push({
        certificateId: `CERT-${r.supplierId}-${standard.replace(/[^A-Za-z0-9]+/g, '')}`,
        supplierId: r.supplierId,
        standard,
        validFrom: addDays(validUntil, -3 * 365),
        validUntil,
        documentId: null,
      });
    }
  }
  return out;
}

const CHILD_OR_FORCED = /\b(child|forced)\s+labou?r\b/i;

/** Alerts of the risk-monitoring partner, restating facts from the other systems. Most severe first, then newest. */
export function riskAlerts(d: DemoDataset): RiskAlert[] {
  const out: RiskAlert[] = [];
  const add = (a: Omit<RiskAlert, 'alertId'>) => out.push({ ...a, alertId: `ALERT-${a.supplierId}-${out.length + 1}` });
  for (const doc of d.documents.filter((x) => x.documentType === 'fine_notice')) {
    add({ supplierId: doc.supplierId, date: doc.issuedOn, severity: 'High', category: 'Legal violation', title: 'Final fine notice by an authority', detail: doc.title });
  }
  for (const r of d.ratings) {
    const country = d.erp.find((e) => e.supplierId === r.supplierId)?.country ?? '';
    if (r.controversies && r.controversies !== 'None known') {
      const year = /\b(20\d\d)\b/.exec(r.controversies)?.[1];
      const human = CHILD_OR_FORCED.test(r.controversies);
      add({
        supplierId: r.supplierId,
        date: year ? `${year}-06-30` : (r.lastUpdated ?? DEMO_DATE),
        severity: human ? 'High' : 'Medium',
        category: human ? 'Human rights' : 'Controversy',
        title: human ? 'Reported child or forced labour' : 'Reported controversy',
        detail: r.controversies,
      });
    }
    if (r.lksgCountryRisk === 'High') {
      add({ supplierId: r.supplierId, date: r.lastUpdated ?? DEMO_DATE, severity: 'High', category: 'Country risk', title: `LkSG country risk High (${country})`, detail: 'Country risk under the German Supply Chain Act; a social audit (SA8000) is required.' });
    }
  }
  for (const c of d.certificates) {
    const daysLeft = (Date.parse(c.validUntil) - Date.parse(DEMO_DATE)) / 86_400_000;
    if (daysLeft <= 120) {
      add({ supplierId: c.supplierId, date: DEMO_DATE, severity: 'Low', category: 'Certificate', title: `${c.standard} expires on ${c.validUntil}`, detail: 'Ask the supplier for the renewed certificate.' });
    }
  }
  const bySupplier = new Map<string, RatingHistoryEntry[]>();
  for (const h of d.ratingHistory) bySupplier.set(h.supplierId, [...(bySupplier.get(h.supplierId) ?? []), h]);
  for (const [supplierId, entries] of bySupplier) {
    const [prev, last] = entries.slice(-2);
    if (prev && last && prev.score - last.score >= 5) {
      add({ supplierId, date: last.assessedOn, severity: 'Low', category: 'Rating', title: `Rating dropped from ${prev.score} to ${last.score}`, detail: `Assessment ${last.year} of the rating partner.` });
    }
  }
  const rank = { High: 0, Medium: 1, Low: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.date.localeCompare(a.date) || a.alertId.localeCompare(b.alertId));
}
