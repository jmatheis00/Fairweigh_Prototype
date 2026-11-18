import { describe, expect, it } from 'vitest';
import type { DecisionRecord } from './decision-record.js';
import type { PurchaseRequisitionRecord } from './sources.js';
import type { AgentRun } from './agent.js';
import { manualRequisition, restoreStartedProcesses, workQueue } from './work-queue.js';

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

describe('restoreStartedProcesses', () => {
  const run = { runId: 'run-1', request: { partId: 'P', supplierIds: [], quantity: 100, neededBy: null } } as unknown as AgentRun;
  const process = { requisition: req('PR-1'), quantity: 100, neededBy: '2026-12-18', step: 2, reached: 3, run, record: null };

  it('gives back what was saved, through JSON like browser storage', () => {
    const restored = restoreStartedProcesses(JSON.parse(JSON.stringify({ 'PR-1': process })));
    expect(restored['PR-1']).toEqual(JSON.parse(JSON.stringify(process)));
  });

  it('drops broken entries and anything that is not a saved list', () => {
    expect(restoreStartedProcesses(null)).toEqual({});
    expect(restoreStartedProcesses([process])).toEqual({});
    const restored = restoreStartedProcesses({
      'PR-1': process,
      'PR-2': { ...process, requisition: req('PR-1') },
      'PR-3': { ...process, requisition: req('PR-3'), step: 7 },
      'PR-4': { ...process, requisition: req('PR-4'), quantity: 0 },
      'PR-5': { ...process, requisition: req('PR-5'), step: 3, reached: 1 },
    });
    expect(Object.keys(restored)).toEqual(['PR-1']);
  });

  it('sends a process without matching evidence back to collecting suppliers, never past it', () => {
    const otherPart = { ...run, request: { ...run.request, partId: 'Q' } };
    const restored = restoreStartedProcesses({
      'PR-1': { ...process, run: null, record: { recordId: 'D' } },
      'PR-2': { ...process, requisition: req('PR-2'), run: otherPart },
    });
    expect(restored['PR-1']).toMatchObject({ step: 1, reached: 1, run: null, record: null });
    expect(restored['PR-2']).toMatchObject({ step: 1, reached: 1, run: null });
  });
});
