import { describe, expect, it } from 'vitest';
import { targetOverview, yearElapsed } from './co2-targets.js';
import type { DecisionRecord } from './decision-record.js';
import type { PurchaseOrderRecord } from './sources.js';

const prov = { file: 'x', sheet: 'x', row: 1, assumedFields: [] };
const po = (c: Partial<PurchaseOrderRecord>): PurchaseOrderRecord => ({
  recordId: 'PO', system: 'erp', supplierId: 'A', notice: '', provenance: prov, poNumber: 'PO', orderDate: '2026-08-01',
  partId: 'STEEL', partName: 'P', quantity: 1000, unitPriceEur: 10, pcfKgPerPiece: 5, pcfBadge: 'Supplier-specific', pcfRecordId: 'PCF',
  cockpitDecisionId: null, replacedSupplierId: null, replacedPcfKgPerPiece: null, replacedUnitPriceEur: null, ...c,
});
const decision = (c: Partial<DecisionRecord>): DecisionRecord => ({
  recordId: 'D', recordedAt: '2026-11-10T10:00:00Z', runId: 'r', mode: { kind: 'fake' }, partId: 'CU', quantity: 100, neededBy: null,
  chosenSupplierId: 'A', recommendedSupplierId: 'A', followsRecommendation: true, reason: 'x', weights: { quality: 25, price: 25, co2: 25, delivery: 25 },
  ranking: [], evidence: [], ...c,
});
const catalog = [
  { partId: 'STEEL', category: 'Steel' },
  { partId: 'CU', category: 'Copper' },
];
const buyers = [
  { name: 'Thomas', title: 'CM', categories: ['Steel', 'Copper'] },
  { name: 'Jonas', title: 'CM', categories: ['Plastics'] },
];

describe('yearElapsed', () => {
  it('is the share of the year passed, capped to 0–1', () => {
    expect(yearElapsed(2026, '2026-01-01')).toBe(0);
    expect(yearElapsed(2026, '2026-07-02')).toBeCloseTo(0.5, 2);
    expect(yearElapsed(2026, '2027-03-01')).toBe(1);
  });
});

describe('targetOverview', () => {
  const orders = [
    po({ cockpitDecisionId: 'DEC-1', replacedSupplierId: 'B', replacedPcfKgPerPiece: 9 }), // steel: 4 t
    po({ cockpitDecisionId: 'DEC-2', replacedSupplierId: 'B', replacedPcfKgPerPiece: 4 }), // adds CO₂: counts 0
    po({ cockpitDecisionId: 'DEC-1', replacedSupplierId: 'B', replacedPcfKgPerPiece: 9, orderDate: '2025-08-01' }), // other year
  ];
  const decisions = [decision({ vsCurrent: { supplierId: 'B', totalDeltaEur: 0, co2TotalDeltaT: -6 } })]; // copper: 6 t, not ordered yet
  const overview = targetOverview({
    orders, decisions, catalog, buyers, year: 2026, today: '2026-07-02',
    targets: { company: 18, buyers: { Thomas: 8, Jonas: 5 }, groups: { Steel: 4, Copper: 20, Plastics: 5 } },
  });

  it('adds avoided CO₂ per commodity group, buyer and company', () => {
    expect(overview.byGroup.map((g) => [g.key, g.achievedTonnes, g.related])).toEqual([
      ['Copper', 6, ['Thomas']],
      ['Plastics', 0, ['Jonas']],
      ['Steel', 4, ['Thomas']],
    ]);
    expect(overview.byBuyer.map((b) => [b.key, b.orderedTonnes, b.decidedTonnes, b.achievedTonnes])).toEqual([
      ['Thomas', 4, 6, 10],
      ['Jonas', 0, 0, 0],
    ]);
    expect(overview.company).toMatchObject({ achievedTonnes: 10, remainingTonnes: 8, percent: 56 });
  });

  it('says achieved, on track (at least the share of the year passed) or at risk', () => {
    const status = Object.fromEntries(overview.byGroup.map((g) => [g.key, g.status]));
    // Half the year passed: copper needs 10 t to be on track, has 6.
    expect(status).toEqual({ Steel: 'achieved', Copper: 'at risk', Plastics: 'at risk' });
    expect(overview.byBuyer[0]!.status).toBe('achieved');
    // Company: 10 t of 18 t is short of the target but ahead of half of it (9 t).
    expect(overview.company.status).toBe('on track');
  });
});
