import { describe, expect, it } from 'vitest';
import type { DocumentRecord, ErpRecord, PcfRecord, PurchaseOrderRecord, RatingRecord } from './sources.js';
import { purchasedCo2, supplierFlags, sustainabilityStats } from './sustainability-stats.js';

const prov = { file: 'x', sheet: 'x', row: 1, assumedFields: [] };
const erp = (supplierId: string, relationshipStatus = 'Active contract') => ({ supplierId, relationshipStatus }) as ErpRecord;
const rating = (supplierId: string, r: Partial<RatingRecord> = {}): RatingRecord => ({
  recordId: `RAT-${supplierId}`, system: 'ratings', supplierId, notice: '', provenance: prov,
  sustainabilityScore: 50, certifications: null, sbtiTarget: false, lksgCountryRisk: 'Low', controversies: 'None known',
  lastUpdated: null, infoRequestStatus: 'Answered', co2DataSource: 'Sustainability report', sustainabilityReport: true, ...r,
});
const pcf = (supplierId: string, partId: string, referenceDate: string, badge: PcfRecord['badge'] = 'Supplier-specific'): PcfRecord => ({
  recordId: `PCF-${supplierId}-${partId}`, system: 'pcf', supplierId, notice: '', provenance: prov, partId,
  pcfKgPerPiece: 1, badge, referenceDate, method: '', boundary: null, referenceYear: null, primaryDataSharePercent: null, assurance: null, source: null,
});
const po = (supplierId: string, partId: string, orderDate: string, kg: number, quantity: number): PurchaseOrderRecord => ({
  recordId: 'PO', system: 'erp', supplierId, notice: '', provenance: prov, poNumber: 'PO', orderDate, partId, partName: partId,
  quantity, unitPriceEur: 1, pcfKgPerPiece: kg, pcfBadge: 'Supplier-specific', pcfRecordId: `PCF-${supplierId}-${partId}`,
  cockpitDecisionId: null, replacedSupplierId: null, replacedPcfKgPerPiece: null, replacedUnitPriceEur: null,
});

describe('sustainabilityStats', () => {
  const input = {
    orders: [
      po('A', 'P1', '2026-05-01', 99, 1000), // Q2: ignored for hotspots
      po('A', 'P1', '2026-08-01', 10, 3000), // 30 t
      po('B', 'P2', '2026-08-01', 5, 2000), // 10 t
    ],
    erp: [erp('A'), erp('B'), erp('C'), erp('X', 'Former supplier')],
    ratings: [
      rating('A', { sbtiTarget: true }),
      rating('B', { infoRequestStatus: 'Requested', lksgCountryRisk: 'High', sustainabilityReport: false }),
      rating('C', { infoRequestStatus: null, controversies: '2025: complaint', sustainabilityReport: null }),
      rating('X', { infoRequestStatus: 'Not requested', lksgCountryRisk: 'High' }),
    ],
    pcf: [pcf('A', 'P1', '2025-01-01'), pcf('B', 'P2', '2026-06-01', 'Company estimate')],
    documents: [{ documentType: 'fine_notice', supplierId: 'X' } as DocumentRecord],
    today: '2026-11-06',
    co2MaxAgeDays: 365,
  };

  it('ranks the CO2 hotspots of the latest quarter with their share', () => {
    const s = sustainabilityStats(input)!;
    expect(s.period).toEqual({ from: '2026-07', to: '2026-09', label: 'Q3 2026' });
    expect(s.co2Tonnes).toBe(40);
    expect(s.hotspots).toEqual([
      { supplierId: 'A', partId: 'P1', co2Tonnes: 30, sharePercent: 75 },
      { supplierId: 'B', partId: 'P2', co2Tonnes: 10, sharePercent: 25 },
    ]);
  });

  it('filters by a chosen period and compares it with the period before', () => {
    const q2 = sustainabilityStats({ ...input, period: { from: '2026-04', to: '2026-06', label: 'Q2 2026' } })!;
    expect([q2.co2Tonnes, q2.hotspots.length, q2.previous]).toEqual([99, 1, null]);
    const q3 = sustainabilityStats(input)!;
    expect(q3.previous).toEqual({ period: { from: '2026-04', to: '2026-06', label: 'Q2 2026' }, co2Tonnes: 99 });
    const empty = sustainabilityStats({ ...input, period: { from: '2026-01', to: '2026-01', label: 'Jan 2026' } })!;
    expect([empty.co2Tonnes, empty.hotspots]).toEqual([0, []]);
  });

  it('flags old CO2 data and keeps the badge', () => {
    const q = sustainabilityStats(input)!.dataQuality;
    expect(q.map((d) => [d.supplierId, d.badge, d.outdated])).toEqual([
      ['A', 'Supplier-specific', true],
      ['B', 'Company estimate', false],
    ]);
  });

  it('rates data per supplier; estimates, web searches and missing ratings never count as supplier data', () => {
    const s = sustainabilityStats({
      ...input,
      ratings: [
        rating('A'),
        rating('B', { co2DataSource: 'Estimate (industry average)' }),
        rating('C', { co2DataSource: 'Web search (AI agent)', sustainabilityScore: null }),
        rating('X', { co2DataSource: null }),
      ],
    })!;
    expect([s.activeSuppliers, s.allSuppliers]).toEqual([3, 4]);
    expect(s.dataLevels).toEqual({ sufficient: 1, partial: 2, insufficient: 1 });
    expect(s.dataGaps).toEqual([
      { supplierId: 'C', level: 'insufficient', missing: ['CO₂ data from the supplier', 'sustainability rating'] },
      { supplierId: 'B', level: 'partial', missing: ['CO₂ data from the supplier'] },
      { supplierId: 'X', level: 'partial', missing: ['CO₂ data from the supplier'] },
    ]);
  });

  it('counts risk for active suppliers and flags the whole base; a missing report is not a yes', () => {
    const s = sustainabilityStats(input)!;
    expect(s.risk).toEqual({ lksgHigh: 1, lksgMedium: 0, controversies: 1, provenViolations: 0, sbtiPercent: 33.3, reportPercent: 33.3 });
    expect(s.flagged).toEqual([
      { supplierId: 'X', flags: ['Proven violation', 'LkSG risk High'] },
      { supplierId: 'B', flags: ['LkSG risk High'] },
      { supplierId: 'C', flags: ['Controversy reported'] },
    ]);
  });

  it('flags the same suppliers on every page: supplierFlags equals the flags of the stats', () => {
    const flags = supplierFlags(input.ratings, input.documents);
    expect(flags).toEqual(sustainabilityStats(input)!.flagged);
    expect(flags.find((f) => f.supplierId === 'X')?.flags).toEqual(['Proven violation', 'LkSG risk High']);
    expect(flags.some((f) => f.supplierId === 'A')).toBe(false);
  });

  it('sums purchased CO2 and the supplier-specific share for a period and the one before, like the stats', () => {
    const q3 = { from: '2026-07', to: '2026-09', label: 'Q3 2026' };
    const orders = [...input.orders, { ...po('B', 'P2', '2026-09-01', 1, 5000), pcfBadge: 'Industry average' as const }];
    const p = purchasedCo2(orders, q3);
    // 30 t + 10 t + 5 t; spend 3,000 + 2,000 supplier-specific of 10,000 in total.
    expect([p.co2Tonnes, p.spendEur, p.supplierSpecificSpendPercent]).toEqual([45, 10000, 50]);
    expect(p.previous).toEqual({ period: { from: '2026-04', to: '2026-06', label: 'Q2 2026' }, co2Tonnes: 99, spendEur: 1000, supplierSpecificSpendPercent: 100 });
    const s = sustainabilityStats({ ...input, orders })!;
    expect([s.co2Tonnes, s.supplierSpecificSpendPercent, s.previous?.co2Tonnes]).toEqual([p.co2Tonnes, p.supplierSpecificSpendPercent, 99]);
    expect(purchasedCo2(orders, { from: '2026-04', to: '2026-06', label: 'Q2 2026' }).previous).toBeNull();
  });

  it('returns nothing without purchase orders', () => {
    expect(sustainabilityStats({ ...input, orders: [] })).toBeNull();
  });
});
