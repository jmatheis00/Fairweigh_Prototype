import { describe, expect, it } from 'vitest';
import type { AgentRun, Evidence } from './agent.js';
import { DEFAULT_WEIGHTS, type DecisionResult } from './decision.js';
import { buildDecisionRecord, csvCell, decisionsToCsv } from './decision-record.js';

const evidence: Evidence = {
  evidenceId: 'e1', supplierId: 'A', topic: 'price', value: 18.36, unit: 'EUR/piece', sentence: '', system: 'documents',
  recordId: 'DOC-OFFER-A', location: { kind: 'document', page: 1, quote: 'Unit price: EUR 18.36 per piece' },
  retrievedAt: '2026-11-05T10:00:00Z', status: 'verified', checkFailures: [], sourceDocumentType: 'offer',
  sourceDate: '2026-10-12', sourceBadge: null,
};
const run: AgentRun = {
  runId: 'run-1', request: { partId: 'P', supplierIds: ['A', 'B', 'X'], quantity: 100, neededBy: null },
  mode: { kind: 'fake' }, status: 'completed', startedAt: '', finishedAt: '', steps: [],
  evidence: [evidence, { ...evidence, evidenceId: 'e2', supplierId: 'B' }], gaps: [], error: null,
};
const points = { quality: 0, price: 0, co2: 0, delivery: 0 };
const result: DecisionResult = {
  ranked: [
    { rank: 1, supplierId: 'A', score: 66, points, verifiedCount: 4, missing: [], assumed: [], capped: [], scoreRange: null, pointsHigh: null, warnings: [] },
    { rank: 2, supplierId: 'B', score: 45, points, verifiedCount: 4, missing: [], assumed: [], capped: [], scoreRange: null, pointsHigh: null, warnings: [] },
  ],
  excluded: [{ supplierId: 'X', knockOut: { reason: 'fine', recordId: 'DOC-FINE-X' }, warnings: [] }],
  recommendation: { supplierId: 'A', score: 66, runnerUpId: 'B', margin: 21, bestIn: [], couldLead: [] },
};
const decidedBy = { name: 'Thomas', role: 'Category Manager, Direct Materials' };
const base = { run, result, weights: DEFAULT_WEIGHTS, recordId: 'd1', recordedAt: '2026-11-05T10:05:00Z', decidedBy };

describe('buildDecisionRecord', () => {
  it('keeps request, weights, ranking and the evidence of the chosen offer', () => {
    const record = buildDecisionRecord({ ...base, chosenSupplierId: 'A', reason: 'Best overall, lower CO2.' });
    expect(record).toMatchObject({ chosenSupplierId: 'A', followsRecommendation: true, quantity: 100, runId: 'run-1', decidedBy });
    expect(record.ranking.map((r) => r.supplierId)).toEqual(['A', 'B', 'X']);
    expect(record.evidence).toEqual([
      expect.objectContaining({ recordId: 'DOC-OFFER-A', location: 'page 1: "Unit price: EUR 18.36 per piece"' }),
    ]);
  });

  it('saves the points per criterion and the reference values, so the calculation can be followed later', () => {
    const ref = (value: number) => ({ value, basis: `test ${value}`, short: 'Today', kind: 'internal' as const, sourceUrl: null });
    const reference = { quality: ref(0.8), price: ref(84.5), co2: ref(38), delivery: ref(95) };
    const record = buildDecisionRecord({ ...base, chosenSupplierId: 'A', reason: '', reference });
    expect(record.ranking[0]!.points).toEqual(points);
    expect(record.ranking.find((r) => r.supplierId === 'X')!.points).toBeNull();
    expect(record.reference).toEqual({
      quality: { value: 0.8, basis: 'test 0.8' },
      price: { value: 84.5, basis: 'test 84.5' },
      co2: { value: 38, basis: 'test 38' },
      delivery: { value: 95, basis: 'test 95' },
    });
    expect(buildDecisionRecord({ ...base, chosenSupplierId: 'A', reason: '' }).reference).toBeNull();
  });

  it('marks a deviation from the recommendation', () => {
    expect(buildDecisionRecord({ ...base, chosenSupplierId: 'B', reason: 'Existing contract runs until 2027.' }).followsRecommendation).toBe(false);
  });

  it('refuses excluded offers, unknown offers and missing reasons', () => {
    expect(() => buildDecisionRecord({ ...base, chosenSupplierId: 'X', reason: 'Cheapest offer in the list' })).toThrow('excluded');
    expect(() => buildDecisionRecord({ ...base, chosenSupplierId: 'Z', reason: 'Cheapest offer in the list' })).toThrow('not one of');
    expect(() => buildDecisionRecord({ ...base, chosenSupplierId: 'B', reason: '  ok  ' })).toThrow('reason');
  });

  it('needs a reason only when the choice differs from the recommendation', () => {
    expect(buildDecisionRecord({ ...base, chosenSupplierId: 'A', reason: '' }).reason).toBe('Follows the recommendation.');
    expect(() => buildDecisionRecord({ ...base, chosenSupplierId: 'B', reason: '' })).toThrow('reason');
  });

  it('logs changed weights with the defaults and refuses weights outside 10–50 %', () => {
    const defaults = { quality: 25, price: 25, co2: 25, delivery: 25 };
    const changed = { quality: 20, price: 35, co2: 20, delivery: 25 };
    expect(() => buildDecisionRecord({ ...base, weights: changed, defaultWeights: defaults, chosenSupplierId: 'A', reason: '' })).toThrow(
      'default weights',
    );
    const record = buildDecisionRecord({
      ...base, weights: changed, defaultWeights: defaults, weightsReason: 'Budget is tight this quarter.', chosenSupplierId: 'A', reason: '',
      requisitionId: 'PR-1',
    });
    expect(record).toMatchObject({ defaultWeights: defaults, weightsReason: 'Budget is tight this quarter.', requisitionId: 'PR-1' });
    expect(() =>
      buildDecisionRecord({ ...base, weights: { quality: 0, price: 100, co2: 0, delivery: 0 }, defaultWeights: defaults, weightsReason: 'Savings target', chosenSupplierId: 'A', reason: '' }),
    ).toThrow('between');
    expect(buildDecisionRecord({ ...base, defaultWeights: defaults, weightsReason: 'ignored text', chosenSupplierId: 'A', reason: '' }).weightsReason).toBeNull();
  });

  it('does not change later when the weights object changes', () => {
    const weights = { ...DEFAULT_WEIGHTS };
    const record = buildDecisionRecord({ ...base, weights, chosenSupplierId: 'A', reason: 'Best overall result.' });
    weights.price = 70;
    expect(record.weights.price).toBe(25);
  });
});

describe('decisionsToCsv', () => {
  it('writes one header and one row per decision, quoting commas and quotes', () => {
    const record = buildDecisionRecord({ ...base, chosenSupplierId: 'B', reason: 'Contract, "framework" until 2027' });
    const csv = decisionsToCsv([record], (id) => `Supplier ${id}`);
    const [header, row] = csv.trim().split('\n');
    expect(header).toContain('Chosen supplier');
    expect(header).toContain('Decided by');
    expect(row).toContain('Thomas (Category Manager, Direct Materials)');
    expect(row).toContain('"Contract, ""framework"" until 2027"');
    expect(row).toContain(',no,');
  });

  it('defuses text that a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(12.5)).toBe('12.5');
  });
});
