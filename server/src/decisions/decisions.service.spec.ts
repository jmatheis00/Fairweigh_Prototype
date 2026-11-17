import type { DecisionRecord } from '@scc/shared';
import { InMemoryDecisionsRepository } from './decisions.repository.js';
import { DecisionsService } from './decisions.service.js';

const record = (recordId: string): DecisionRecord => ({
  recordId,
  decidedBy: null,
  recordedAt: '2026-11-16T10:00:00.000Z',
  runId: 'run-1',
  mode: { kind: 'fake' },
  partId: 'P-1',
  quantity: 100,
  neededBy: null,
  chosenSupplierId: 'S-1',
  recommendedSupplierId: 'S-1',
  followsRecommendation: true,
  reason: '',
  weights: { quality: 25, price: 25, co2: 25, delivery: 25 },
  ranking: [],
  evidence: [],
});

describe('DecisionsService', () => {
  it('starts empty and keeps added decisions in order', async () => {
    const s = new DecisionsService(new InMemoryDecisionsRepository());
    expect(await s.list()).toEqual([]);
    await s.add(record('D-1'));
    await s.add(record('D-2'));
    expect((await s.list()).map((r) => r.recordId)).toEqual(['D-1', 'D-2']);
  });

  it('rejects incomplete records and duplicates, so the log cannot be overwritten', async () => {
    const s = new DecisionsService(new InMemoryDecisionsRepository());
    await expect(s.add({ ...record('D-1'), chosenSupplierId: '' })).rejects.toThrow('chosenSupplierId is missing');
    await expect(s.add([])).rejects.toThrow('must be an object');
    await s.add(record('D-1'));
    await expect(s.add(record('D-1'))).rejects.toThrow('already recorded');
    expect(await s.list()).toHaveLength(1);
  });
});
