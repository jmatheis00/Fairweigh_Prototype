import { describe, expect, it } from 'vitest';
import type { AgentRun, Evidence } from './agent.js';
import { compareWithBaseline } from './comparison.js';

let n = 0;
function ev(supplierId: string, topic: 'price' | 'co2', value: number, status: Evidence['status'] = 'verified'): Evidence {
  n += 1;
  return {
    evidenceId: `e${n}`, supplierId, topic, value, unit: '', sentence: '', system: 'documents', recordId: 'R',
    location: { kind: 'field', field: 'x' }, retrievedAt: 't', status, checkFailures: [],
    sourceDocumentType: null, sourceDate: null, sourceBadge: null,
  };
}
const run = (evidence: Evidence[]): AgentRun => ({
  runId: 'r', request: { partId: 'P', supplierIds: ['NEW', 'OLD'], quantity: 10000, neededBy: null },
  mode: { kind: 'fake' }, status: 'completed', startedAt: '', finishedAt: '', steps: [], evidence, gaps: [], error: null,
});

describe('compareWithBaseline', () => {
  it('computes price and CO2 differences per piece, in percent and for the quantity', () => {
    const r = run([ev('NEW', 'price', 20.7), ev('OLD', 'price', 18.36), ev('NEW', 'co2', 3.1), ev('OLD', 'co2', 7.4)]);
    expect(compareWithBaseline(r, 'NEW', 'OLD', 75)).toEqual({
      offerId: 'NEW', baselineId: 'OLD',
      priceDeltaEur: 2.34, pricePercent: 12.7, totalDeltaEur: 23400,
      co2DeltaKg: -4.3, co2Percent: -58.1, co2TotalDeltaT: -43,
      // -43 t x 75 EUR = -3,225 EUR; 23,400 - 3,225 = 20,175 EUR
      co2CostDeltaEur: -3225, totalWithCo2DeltaEur: 20175,
    });
  });

  it('gives no number when one side is missing or not verified', () => {
    const r = run([ev('NEW', 'price', 20.7), ev('OLD', 'price', 18.36, 'not_verified'), ev('NEW', 'co2', 3.1)]);
    const c = compareWithBaseline(r, 'NEW', 'OLD', 75);
    expect(c.totalWithCo2DeltaEur).toBeNull();
    expect(c.priceDeltaEur).toBeNull();
    expect(c.totalDeltaEur).toBeNull();
    expect(c.co2Percent).toBeNull();
  });

  it('is zero when the offer is the baseline itself', () => {
    const r = run([ev('OLD', 'price', 18.36), ev('OLD', 'co2', 7.4)]);
    expect(compareWithBaseline(r, 'OLD', 'OLD', 75)).toMatchObject({ priceDeltaEur: 0, co2Percent: 0, totalWithCo2DeltaEur: 0 });
  });
});
