import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from './decision-record.js';
import { impactStats } from './impact-stats.js';
import type { PurchaseOrderRecord } from './sources.js';

const prov = { file: 'x', sheet: 'x', row: 1, assumedFields: [] };
function po(c: Partial<PurchaseOrderRecord>): PurchaseOrderRecord {
  return {
    recordId: 'PO', system: 'erp', supplierId: 'A', notice: '', provenance: prov, poNumber: 'PO', orderDate: '2026-08-01',
    partId: 'P', partName: 'P', quantity: 1000, unitPriceEur: 10, pcfKgPerPiece: 5, pcfBadge: 'Supplier-specific', pcfRecordId: 'PCF',
    cockpitDecisionId: null, replacedSupplierId: null, replacedPcfKgPerPiece: null, replacedUnitPriceEur: null, ...c,
  };
}
const switched = (c: Partial<PurchaseOrderRecord> = {}) =>
  po({ cockpitDecisionId: 'D1', replacedSupplierId: 'B', replacedPcfKgPerPiece: 9, replacedUnitPriceEur: 9.5, ...c });

describe('impactStats', () => {
  it('adds extra cost and avoided CO2e per decision and gives the cost per tonne', () => {
    // Per order: +0.50 EUR × 1,000 = 500 EUR, (9 − 5) kg × 1,000 = 4 t
    const s = impactStats([switched(), switched({ orderDate: '2026-09-01' }), po({ orderDate: '2026-08-02' })], [], 75)!;
    expect(s.decisions).toEqual([
      { decisionId: 'D1', partId: 'P', supplierId: 'A', replacedSupplierId: 'B', extraCostEur: 1000, avoidedTonnes: 8, costPerTonneEur: 125 },
    ]);
    expect([s.extraCostEur, s.avoidedTonnes, s.costPerTonneEur, s.co2ValueEur]).toEqual([1000, 8, 125, 600]);
  });

  it('shows a negative cost when the greener supplier is also cheaper, and nets decisions', () => {
    const cheaper = switched({ cockpitDecisionId: 'D2', partId: 'Q', unitPriceEur: 9, replacedUnitPriceEur: 9.5 });
    const s = impactStats([switched(), cheaper], [], 75)!;
    expect(s.decisions.find((d) => d.decisionId === 'D2')?.costPerTonneEur).toBe(-125);
    expect([s.extraCostEur, s.avoidedTonnes, s.costPerTonneEur]).toEqual([0, 8, 0]);
  });

  it('only counts the latest quarter and decisions with a replaced supplier', () => {
    const s = impactStats([switched({ orderDate: '2026-05-01' }), switched(), po({ cockpitDecisionId: 'D9' })], [], 75)!;
    expect(s.period).toEqual({ from: '2026-07', to: '2026-09', label: 'Q3 2026' });
    expect(s.decisions.map((d) => d.decisionId)).toEqual(['D1']);
  });

  it('counts the decisions of a chosen period', () => {
    const s = impactStats([switched({ orderDate: '2026-05-01' }), switched()], [], 75, { from: '2026-04', to: '2026-09', label: 'Apr – Sep 2026' })!;
    expect([s.decisions.length, s.avoidedTonnes]).toEqual([1, 8]);
    expect(impactStats([switched()], [], 75, { from: '2026-04', to: '2026-04', label: 'Apr 2026' })!.decisions).toEqual([]);
  });

  it('reads the decision log for the share that follows the recommendation', () => {
    const log = [{ followsRecommendation: true }, { followsRecommendation: true }, { followsRecommendation: false }] as DecisionRecord[];
    const s = impactStats([switched()], log, 75)!;
    expect([s.recordedDecisions, s.followsRecommendationPercent]).toEqual([3, 67]);
    expect(impactStats([switched()], [], 75)!.followsRecommendationPercent).toBeNull();
    expect(impactStats([], log, 75)).toBeNull();
  });
  it('gives zero impact instead of nothing when a chosen period has no orders (commodity group without orders)', () => {
    const s = impactStats([], [], 75, { from: '2026-07', to: '2026-09', label: 'Q3 2026' });
    expect(s).not.toBeNull();
    expect([s!.extraCostEur, s!.avoidedTonnes, s!.decisions.length]).toEqual([0, 0, 0]);
    expect(impactStats([], [], 75)).toBeNull();
  });
});
