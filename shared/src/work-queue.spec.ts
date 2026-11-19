import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from './decision-record.js';
import type { PurchaseRequisitionRecord } from './sources.js';
import { manualRequisition, workQueue } from './work-queue.js';

const req = (id: string): PurchaseRequisitionRecord => ({
  recordId: id, system: 'erp', notice: '', partId: 'P', partName: 'P', category: 'C', quantity: 100,
  neededBy: '2026-12-18', createdOn: '2026-11-03', requestedBy: 'Plant', buyer: 'Thomas', status: 'open',
});
const decision = (c: Partial<DecisionRecord>): DecisionRecord => ({
  recordId: 'D', recordedAt: '2026-11-10T10:00:00Z', runId: 'r', mode: { kind: 'fake' }, partId: 'P', quantity: 100, neededBy: null,
  chosenSupplierId: 'A', recommendedSupplierId: 'A', followsRecommendation: true, reason: 'x', weights: { quality: 25, price: 25, co2: 25, delivery: 25 },
  ranking: [], evidence: [], ...c,
});
describe('workQueue', () => {
  it('marks requisitions open, in progress or decided', () => {
    const q = workQueue([req('PR-1'), req('PR-2'), req('PR-3')], [decision({ requisitionId: 'PR-3' })], new Set(['PR-2', 'PR-3']));
    expect(q.map((e) => e.status)).toEqual(['open', 'in progress', 'decided']);
    expect(q[2]!.decision?.recordId).toBe('D');
  });

  it('treats a requisition the ERP marks as started as in progress, even before the cockpit opened it', () => {
    const q = workQueue([{ ...req('PR-4'), status: 'in progress' }], [], new Set());
    expect(q[0]!.status).toBe('in progress');
  });
});

describe('manualRequisition', () => {
  const catalog = [
    { partId: 'P-ALU', partName: 'Housing', category: 'Aluminium', hasOffers: true },
    { partId: 'P-NONE', partName: 'Other', category: 'Other', hasOffers: false },
  ];
  const input = { partId: 'P-ALU', quantity: 500, neededBy: '2027-01-15', requestedBy: ' Plant Mannheim ' };

  it('creates an open requisition marked as manual with the next free number', () => {
    const r = manualRequisition(input, catalog, ['PR-10041207', 'PR-M-0001', 'PR-M-0003'], 'Thomas', '2026-11-18');
    expect(r).toMatchObject({
      recordId: 'PR-M-0004', origin: 'manual', status: 'open', partName: 'Housing', category: 'Aluminium',
      quantity: 500, neededBy: '2027-01-15', createdOn: '2026-11-18', requestedBy: 'Plant Mannheim', buyer: 'Thomas',
    });
    expect(manualRequisition(input, catalog, [], 'Thomas', '2026-11-18')?.recordId).toBe('PR-M-0001');
  });

  it('refuses parts without offers, unknown parts and quantities below 1', () => {
    expect(manualRequisition({ ...input, partId: 'P-NONE' }, catalog, [], 'Thomas', '2026-11-18')).toBeNull();
    expect(manualRequisition({ ...input, partId: 'P-X' }, catalog, [], 'Thomas', '2026-11-18')).toBeNull();
    expect(manualRequisition({ ...input, quantity: 0 }, catalog, [], 'Thomas', '2026-11-18')).toBeNull();
  });
});
