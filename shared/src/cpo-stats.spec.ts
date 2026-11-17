import { describe, expect, it } from 'vitest';
import { cockpitUse, co2Intensity, contractsEnding, needsContractAction, seriousRiskSupplierIds } from './cpo-stats.js';
import type { DecisionRecord } from './decision-record.js';
import type { ErpRecord, PurchaseOrderRecord } from './sources.js';

const prov = { file: 'x', sheet: 'x', row: 1, assumedFields: [] };
const po = (c: Partial<PurchaseOrderRecord>): PurchaseOrderRecord => ({
  recordId: 'PO', system: 'erp', supplierId: 'A', notice: '', provenance: prov, poNumber: 'PO', orderDate: '2026-08-01',
  partId: 'P', partName: 'P', quantity: 1000, unitPriceEur: 10, pcfKgPerPiece: 5, pcfBadge: 'Supplier-specific', pcfRecordId: 'PCF',
  cockpitDecisionId: null, replacedSupplierId: null, replacedPcfKgPerPiece: null, replacedUnitPriceEur: null, ...c,
});
const q3 = { from: '2026-07', to: '2026-09', label: 'Q3 2026' };

describe('co2Intensity', () => {
  it('gives kg CO₂e per EUR, the period before and the share of spend with supplier-specific CO₂ data', () => {
    const orders = [
      po({}), // EUR 10,000, 5 t, supplier-specific
      po({ unitPriceEur: 30, pcfKgPerPiece: 15, pcfBadge: 'Industry average' }), // EUR 30,000, 15 t
      po({ orderDate: '2026-05-01', pcfKgPerPiece: 8 }), // Q2: EUR 10,000, 8 t
    ];
    expect(co2Intensity(orders, q3)).toEqual({
      spendEur: 40000, co2Tonnes: 20, kgPerEur: 0.5, previousKgPerEur: 0.8, supplierSpecificPercent: 25,
    });
    expect(co2Intensity([], q3)).toMatchObject({ kgPerEur: null, supplierSpecificPercent: null });
  });
});

describe('cockpitUse', () => {
  it('counts the decisions of the period and the share following the recommendation', () => {
    const d = (recordedAt: string, followsRecommendation: boolean) => ({ recordedAt, followsRecommendation }) as DecisionRecord;
    const log = [d('2026-07-04T10:00:00Z', true), d('2026-08-01T10:00:00Z', false), d('2026-11-10T10:00:00Z', true)];
    expect(cockpitUse(log, q3)).toEqual({ decisions: 2, followsRecommendationPercent: 50 });
    expect(cockpitUse([], q3).followsRecommendationPercent).toBeNull();
  });
});

describe('contractsEnding', () => {
  it('lists contracts of active suppliers ending within six months, soonest first', () => {
    const e = (supplierId: string, contractEnd: string | null, relationshipStatus = 'Active contract') =>
      ({ supplierId, category: 'Steel', contractEnd, relationshipStatus, annualSpendEur: 1000 }) as ErpRecord;
    const erp = [e('S1', '2027-03-31'), e('S2', '2026-12-31'), e('S3', '2027-06-30'), e('S4', '2026-12-01', 'Former supplier'), e('S5', null), e('S6', '2026-10-01')];
    expect(contractsEnding(erp, '2026-11-06').map((c) => [c.supplierId, c.daysLeft])).toEqual([
      ['S2', 55],
      ['S1', 145],
    ]);
  });
});

describe('needsContractAction', () => {
  it('is true only when a contract ends within 60 days', () => {
    const c = (daysLeft: number) => ({ supplierId: 'A', category: 'Steel', contractEnd: '2027-01-01', annualSpendEur: 1, daysLeft });
    expect(needsContractAction([c(61), c(60)])).toBe(true);
    expect(needsContractAction([c(61), c(150)])).toBe(false);
    expect(needsContractAction([])).toBe(false);
  });
});

describe('seriousRiskSupplierIds', () => {
  const e = (supplierId: string, relationshipStatus = 'Active contract') => ({ supplierId, relationshipStatus }) as ErpRecord;
  const today = '2026-11-06';
  it('flags expired certificates and LkSG risk High, not soon-expiring certificates or missing ratings', () => {
    const erp = [e('EXPIRED'), e('SOON'), e('HIGH'), e('NORATING'), e('INACTIVE', 'Former supplier'), e('FINE')];
    const ratings = [
      { supplierId: 'HIGH', lksgCountryRisk: 'High' as const },
      { supplierId: 'INACTIVE', lksgCountryRisk: 'High' as const },
      { supplierId: 'FINE', lksgCountryRisk: 'Low' as const },
    ];
    const certificates = [
      { supplierId: 'EXPIRED', validUntil: '2026-10-01' },
      { supplierId: 'SOON', validUntil: '2026-12-01' },
      { supplierId: 'FINE', validUntil: '2027-06-01' },
    ];
    expect(seriousRiskSupplierIds(erp, ratings, certificates, today)).toEqual(['EXPIRED', 'HIGH']);
    expect(seriousRiskSupplierIds([], [], [], today)).toEqual([]);
  });
});
