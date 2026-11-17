import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from './decision-record.js';
import type { PurchaseRequisitionRecord } from './sources.js';
import { workQueue } from './work-queue.js';

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
