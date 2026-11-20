import { describe, expect, it } from 'vitest';
import { abatementOptions, co2TargetPath, isExcludedSupplier, supplierBaseStats, withoutDecidedSwitches } from './analytics.js';
import type { CatalogPart, CompanyEmissionsRecord, DocumentRecord, ErpRecord, Offer, PcfRecord, PurchaseOrderRecord, RatingRecord, SupplierPerformanceMonth } from './sources.js';

const erp = (supplierId: string, category: string, relationshipStatus = 'Active contract') => ({ supplierId, category, relationshipStatus }) as ErpRecord;
const em = (supplierId: string, intensityKgPerEur: number) => ({ supplierId, intensityKgPerEur }) as CompanyEmissionsRecord;
const spend = (supplierId: string, eur: number): SupplierPerformanceMonth[] =>
  Array.from({ length: 12 }, (_, i) => ({ supplierId, month: `2026-${String(i + 1).padStart(2, '0')}`, deliveries: 1, onTimeDeliveries: 1, qualityNotifications: 0, spendEur: eur / 12 }));

describe('supplierBaseStats', () => {
  const s = supplierBaseStats(
    [erp('A', 'Steel'), erp('B', 'Steel'), erp('C', 'Steel'), erp('D', 'Steel'), erp('X', 'Steel', 'Quote only')],
    [...spend('A', 900_000), ...spend('B', 600_000), ...spend('C', 300_000), ...spend('D', 200_000)],
    [em('A', 0.6), em('B', 0.3), em('C', 0.5), em('D', 0.2), em('X', 0.4)],
  )!;

  it('compares each current supplier with the average intensity of its category', () => {
    // Category average over all five suppliers: (0.6 + 0.3 + 0.5 + 0.2 + 0.4) / 5 = 0.4
    const a = s.points.find((p) => p.supplierId === 'A')!;
    expect([a.categoryAverageKgPerEur, a.versusAveragePercent, a.co2Tonnes]).toEqual([0.4, 50, 540]);
    expect(s.points.map((p) => p.supplierId)).toEqual(['A', 'B', 'C', 'D']); // only active contracts
  });

  it('marks high spend with above-average CO₂ as switch candidates', () => {
    expect(Object.fromEntries(s.points.map((p) => [p.supplierId, p.quadrant]))).toEqual({ A: 'Switch candidate', B: 'Keep', C: 'Watch', D: 'Fine' });
  });

  it('finds the fewest suppliers that make up 80 % of spend', () => {
    expect(s.pareto.suppliers).toBe(3); // 900k + 600k = 75 % < 80 %, + 300k = 90 %
  });
});

describe('abatementOptions', () => {
  const catalog = [{ partId: 'P', hasOffers: true, currentSupplierId: 'A' }] as CatalogPart[];
  const offer = (supplierId: string, unitPriceEur: number) => ({ partId: 'P', supplierId, unitPriceEur }) as Offer;
  const pcf = (supplierId: string, kg: number) => ({ partId: 'P', supplierId, pcfKgPerPiece: kg, badge: 'Verified' }) as PcfRecord;
  const po = (orderDate: string, quantity: number) => ({ partId: 'P', orderDate, quantity }) as PurchaseOrderRecord;
  const options = abatementOptions({
    catalog,
    offers: [offer('A', 10), offer('B', 11), offer('C', 9.5), offer('D', 8)],
    pcf: [pcf('A', 5), pcf('B', 3), pcf('C', 4), pcf('D', 2)],
    purchaseOrders: [po('2026-03-01', 1000), po('2026-09-01', 1000), po('2025-01-01', 9999)],
    ratings: [{ supplierId: 'D', lksgCountryRisk: 'High', certifications: null, controversies: null } as RatingRecord],
    documents: [],
    lastMonth: '2026-09',
  });

  it('ranks switches by cost per tonne avoided, cheapest CO₂ first, at last year\'s quantity', () => {
    // C: (4 − 5)… saves 1 kg × 2,000 = 2 t for −1,000 EUR = −500 EUR/t. B: 4 t for +2,000 EUR = +500 EUR/t.
    expect(options.map((o) => [o.toSupplierId, o.avoidedTonnes, o.extraCostEur, o.costPerTonneEur])).toEqual([
      ['C', 2, -1000, -500],
      ['B', 4, 2000, 500],
    ]);
  });

  it('leaves out offers excluded by the knock-out rules', () => {
    expect(isExcludedSupplier('D', [{ supplierId: 'D', lksgCountryRisk: 'High', certifications: 'ISO 9001', controversies: null } as RatingRecord], [])).toBe(true);
    expect(isExcludedSupplier('E', [], [{ supplierId: 'E', documentType: 'fine_notice' } as DocumentRecord])).toBe(true);
    expect(options.some((o) => o.toSupplierId === 'D')).toBe(false);
  });

  it('leaves out a switch the Decision Log already holds, only for that part and supplier', () => {
    const decided = withoutDecidedSwitches(options, [
      { partId: 'P', chosenSupplierId: 'C' },
      { partId: 'OTHER', chosenSupplierId: 'B' },
    ]);
    expect(decided.map((o) => o.toSupplierId)).toEqual(['B']);
    expect(withoutDecidedSwitches(options, [])).toEqual(options);
  });

  it('leaves out every switch for a part whose latest decision kept the current supplier', () => {
    // An earlier switch to A (as in the July examples) does not count as "kept": the switches stay listed.
    expect(withoutDecidedSwitches(options, [{ partId: 'P', chosenSupplierId: 'A', recordedAt: '2026-07-03' }])).toEqual(options);
    const kept = { partId: 'P', chosenSupplierId: 'A', recordedAt: '2026-11-20', keptCurrentSupplier: true };
    expect(withoutDecidedSwitches(options, [{ partId: 'P', chosenSupplierId: 'A', recordedAt: '2026-07-03' }, kept])).toEqual([]);
    // A later switch decision replaces the "kept" one: only the switch it decided leaves the list.
    expect(withoutDecidedSwitches(options, [kept, { partId: 'P', chosenSupplierId: 'C', recordedAt: '2026-11-21' }]).map((o) => o.toSupplierId)).toEqual(['B']);
  });
});

describe('co2TargetPath', () => {
  it('lowers the 2025 average by 4.2 % a year, centred on mid-2025', () => {
    const orders = ['2025-01', '2025-06', '2025-12', '2026-06'].map((m) => ({ orderDate: `${m}-15`, pcfKgPerPiece: 10, quantity: 1000 }) as PurchaseOrderRecord);
    const path = co2TargetPath(orders);
    expect(path.map((p) => p.actualTonnes)).toEqual([10, 10, 10, 10]);
    expect(path.find((p) => p.month === '2026-06')!.targetTonnes).toBeCloseTo(10 * (1 - 0.042 * (11.5 / 12)), 1);
  });
});
