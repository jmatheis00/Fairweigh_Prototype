import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  DEFAULT_WEIGHTS,
  benchmarkPoints,
  decide,
  percentBetter,
  rebalanceWeights,
  weightSensitivity,
  withAssumedValues,
  type Benchmarks,
  type DecisionOffer,
  type Weights,
} from './decision.js';

/**
 * Mandatory tests (CLAUDE.md): decision engine, PLAN.md section 3.
 * Values: quality = complaint rate %, price = EUR/piece, co2 = kg/piece, delivery = on-time %.
 */
function offer(supplierId: string, values: Partial<DecisionOffer['values']>, extra: Partial<DecisionOffer> = {}): DecisionOffer {
  return {
    supplierId,
    values: { quality: null, price: null, co2: null, delivery: null, ...values },
    knockOut: null,
    warnings: [],
    ...extra,
  };
}

const A = offer('A', { quality: 0.8, price: 18.4, co2: 2.1, delivery: 97 });
const B = offer('B', { quality: 1.2, price: 17.7, co2: 6.2, delivery: 89 });
const C = offer('C', { price: 16.9, co2: 9.8 });
const D = offer('D', { quality: 2.5, price: 15.3, co2: 8.0, delivery: 88 }, {
  knockOut: { reason: 'Proven violation: fine for wastewater discharge', recordId: 'DOC-FINE-S-0005' },
});

describe('decide: knock-outs', () => {
  it('excludes offers with a proven violation but keeps them visible', () => {
    const result = decide([A, B, C, D]);
    expect(result.ranked.map((r) => r.supplierId)).not.toContain('D');
    expect(result.excluded).toEqual([{ supplierId: 'D', knockOut: D.knockOut, warnings: [] }]);
  });

  it('ignores knocked-out values when normalising the others', () => {
    // D has the lowest price; without D, C (16.90) is the cheapest and gets 100.
    const ranked = decide([A, B, C, D]).ranked;
    expect(ranked.find((r) => r.supplierId === 'C')?.points.price).toBe(100);
  });

  it('gives no recommendation if every offer is excluded', () => {
    expect(decide([D]).recommendation).toBeNull();
  });
});

describe('decide: points against benchmarks (decision of 8 Nov 2026)', () => {
  const bench = (quality: number, price: number, co2: number, delivery: number): Benchmarks => ({
    quality: { value: quality, basis: 'test', short: 'test', kind: 'internal', sourceUrl: null },
    price: { value: price, basis: 'test', short: 'test', kind: 'internal', sourceUrl: null },
    co2: { value: co2, basis: 'test', short: 'test', kind: 'official', sourceUrl: 'https://example.org' },
    delivery: { value: delivery, basis: 'test', short: 'test', kind: 'internal', sourceUrl: null },
  });

  it('gives 50 points at the benchmark and one point per percent better or worse', () => {
    expect(benchmarkPoints('price', 90, 90)).toBe(50);
    expect(benchmarkPoints('price', 81, 90)).toBeCloseTo(60); // 10 % cheaper
    expect(benchmarkPoints('co2', 38, 32)).toBeCloseTo(31.25); // 18.75 % more CO₂
    expect(percentBetter('price', 81, 90)).toBeCloseTo(10);
  });

  it('caps the points at 0 and 100', () => {
    expect(benchmarkPoints('co2', 10, 32)).toBe(100); // more than half below the benchmark
    expect(benchmarkPoints('co2', 60, 32)).toBe(0); // more than half above
  });

  it('compares delivery by the share of deliveries on time (decision of 18 Nov 2026)', () => {
    // 97 % vs 95 % on time = 2.1 % more deliveries on time -> 52.1 points (was 90 with the late share).
    expect(benchmarkPoints('delivery', 97, 95)).toBeCloseTo(52.11, 2);
    expect(benchmarkPoints('delivery', 95, 95)).toBe(50);
    expect(benchmarkPoints('delivery', 90, 95)).toBeCloseTo(44.74, 2);
  });

  it('compares quality by the share of deliveries without a complaint (decision of 18 Nov 2026)', () => {
    // 1.0 % vs 0.8 % complaints = 99.0 % vs 99.2 % without a complaint = 0.2 % worse -> 49.8 points (was 25).
    expect(benchmarkPoints('quality', 1.0, 0.8)).toBeCloseTo(49.8, 1);
    expect(percentBetter('quality', 1.0, 0.8)).toBeCloseTo(-0.2, 1);
    expect(benchmarkPoints('quality', 0.8, 0.8)).toBe(50);
    expect(benchmarkPoints('quality', 0.4, 0.8)).toBeCloseTo(50.4, 1);
  });

  it('keeps price and CO₂ as less money and less CO₂', () => {
    expect(percentBetter('price', 85.35, 84.5)).toBeCloseTo(-1.0, 1);
    expect(benchmarkPoints('co2', 22.6, 38)).toBeCloseTo(90.5, 1);
  });

  it('gives the current supplier exactly 50 when its own values are the reference (today, 17 Nov 2026)', () => {
    const today = bench(0.8, 18.4, 2.1, 97); // = offer A, the current supplier
    const result = decide([A, B], DEFAULT_WEIGHTS, today);
    const a = result.ranked.find((r) => r.supplierId === 'A')!;
    expect(a.score).toBe(50);
    expect(Object.values(a.points)).toEqual([50, 50, 50, 50]);
    // B is worse than today on quality, CO₂ and delivery, so it scores below 50.
    expect(result.ranked.find((r) => r.supplierId === 'B')!.score).toBeLessThan(50);
  });

  it('does not depend on the other offers: adding an offer changes nobody else\'s points', () => {
    const b = bench(1, 18, 5, 95);
    const alone = decide([A], DEFAULT_WEIGHTS, b).ranked[0]!;
    const withOthers = decide([A, B, C], DEFAULT_WEIGHTS, b).ranked.find((r) => r.supplierId === 'A')!;
    expect(withOthers.points).toEqual(alone.points);
  });

  it('still gives 0 points to missing values, so gaps never help', () => {
    const r = decide([A, C], DEFAULT_WEIGHTS, bench(1, 18, 5, 95)).ranked.find((x) => x.supplierId === 'C')!;
    expect([r.points.quality, r.points.delivery]).toEqual([0, 0]);
    expect(r.missing).toEqual(['quality', 'delivery']);
  });

  it('lets an estimated value hurt but never help: at most 50 points (19 Nov 2026)', () => {
    const better = offer('E', { quality: 1, price: 18, co2: 2.5, delivery: 95 }, { estimated: ['co2'] }); // 50 % less CO₂
    const worse = offer('F', { quality: 1, price: 18, co2: 7.5, delivery: 95 }, { estimated: ['co2'] }); // 50 % more CO₂
    const real = offer('G', { quality: 1, price: 18, co2: 2.5, delivery: 95 });
    const r = decide([better, worse, real], DEFAULT_WEIGHTS, bench(1, 18, 5, 95)).ranked;
    const by = (id: string) => r.find((x) => x.supplierId === id)!;
    expect(by('E').points.co2).toBe(50);
    expect(by('E').capped).toEqual(['co2']);
    expect(by('F').points.co2).toBe(0);
    expect(by('F').capped).toEqual([]);
    expect(by('G').points.co2).toBe(100);
    expect(r[0]!.supplierId).toBe('G');
  });

  it('also caps an estimate at the middle without benchmarks', () => {
    const r = decide([offer('E', { co2: 1 }, { estimated: ['co2'] }), offer('F', { co2: 9 })]).ranked;
    expect(r.find((x) => x.supplierId === 'E')!.points.co2).toBe(50);
  });

  it('gives a supplier that never delivered a score range and ranks it by the low end', () => {
    const b = bench(1, 18, 5, 95);
    const range = { quality: 2, delivery: 90, qualityBest: 0.5, deliveryBest: 99, peers: 5 };
    const newcomer = offer('N', { price: 17, co2: 4 });
    const [filled] = withAssumedValues([newcomer], range, new Set(['N']));
    const result = decide([filled!, A], DEFAULT_WEIGHTS, b);
    const r = result.ranked.find((x) => x.supplierId === 'N')!;
    expect(r.assumed).toEqual(['quality', 'delivery']);
    expect(r.verifiedCount).toBe(2); // assumed values are not verified
    // Low end: weakest values (98 % vs 99 % without complaint, 90 % vs 95 % on time).
    expect([r.points.quality, r.points.delivery]).toEqual([49, 44.7]);
    // High end: best values (99.5 % vs 99 % without complaint, 99 % vs 95 % on time).
    expect(r.pointsHigh).toEqual({ quality: 50.5, delivery: 54.2 });
    expect(r.scoreRange!.low).toBe(r.score); // the ranking uses the low end
    expect(r.scoreRange!.high).toBeGreaterThan(r.score);
  });

  it('never ranks a supplier that never delivered above one with real data (18 Nov 2026)', () => {
    const b = bench(1, 18, 5, 95);
    // Much cheaper and cleaner than A, but without deliveries: it still comes after A.
    const [filled] = withAssumedValues([offer('N', { price: 9, co2: 2 })], { quality: 2, delivery: 90, qualityBest: 0.5, deliveryBest: 99, peers: 5 }, new Set(['N']));
    const result = decide([filled!, A], DEFAULT_WEIGHTS, b);
    expect(result.ranked.map((r) => r.supplierId)).toEqual(['A', 'N']);
    expect(result.recommendation!.supplierId).toBe('A');
    expect(result.ranked[1]!.score).toBeGreaterThan(result.ranked[0]!.score);
    // Only suppliers without deliveries: the best of them is still ranked first.
    expect(decide([filled!], DEFAULT_WEIGHTS, b).recommendation!.supplierId).toBe('N');
  });

  it('says when a supplier without deliveries could beat the recommendation at its best', () => {
    const b = bench(1, 18, 5, 95);
    const [filled] = withAssumedValues([offer('N', { price: 15, co2: 3 })], { quality: 2, delivery: 90, qualityBest: 0.5, deliveryBest: 99, peers: 5 }, new Set(['N']));
    const result = decide([filled!, A], DEFAULT_WEIGHTS, b);
    expect(result.recommendation!.supplierId).toBe('A');
    expect(result.recommendation!.couldLead.map((c) => c.supplierId)).toEqual(['N']);
    // Suppliers with deliveries are not touched, and gaps of other criteria stay at 0.
    expect(withAssumedValues([C], { quality: 2, delivery: 90, qualityBest: 0.5, deliveryBest: 99, peers: 5 }, new Set(['N']))[0]).toBe(C);
    expect(decide([A, B], DEFAULT_WEIGHTS, b).ranked.every((x) => x.scoreRange === null)).toBe(true);
  });

  it('keeps knock-outs out of the ranking', () => {
    const result = decide([A, D], DEFAULT_WEIGHTS, bench(1, 18, 5, 95));
    expect(result.ranked.map((r) => r.supplierId)).toEqual(['A']);
    expect(result.excluded.map((x) => x.supplierId)).toEqual(['D']);
  });

  it('feeds the robustness check with the same benchmarks', () => {
    expect(weightSensitivity([A, B], DEFAULT_WEIGHTS, bench(1, 18, 5, 95))).toHaveLength(4);
  });
});

describe('decide: min-max normalisation (without benchmarks)', () => {
  it('gives the best value 100 and the worst 0, with lower or higher as better', () => {
    const ranked = decide([A, B]).ranked;
    const a = ranked.find((r) => r.supplierId === 'A')!;
    const b = ranked.find((r) => r.supplierId === 'B')!;
    expect(a.points).toEqual({ quality: 100, price: 0, co2: 100, delivery: 100 });
    expect(b.points).toEqual({ quality: 0, price: 100, co2: 0, delivery: 0 });
  });

  it('places values in between proportionally', () => {
    const mid = offer('M', { price: 17.15 });
    const ranked = decide([offer('X', { price: 16.9 }), mid, offer('Y', { price: 17.4 })]).ranked;
    expect(ranked.find((r) => r.supplierId === 'M')?.points.price).toBe(50);
  });

  it('gives 100 points if all values are equal or there is only one', () => {
    expect(decide([offer('X', { co2: 5 }), offer('Y', { co2: 5 })]).ranked.map((r) => r.points.co2)).toEqual([100, 100]);
    expect(decide([offer('X', { delivery: 90 })]).ranked[0]?.points.delivery).toBe(100);
  });
});

describe('decide: missing or unverified values', () => {
  it('gives 0 points and lists the gap', () => {
    const c = decide([A, B, C]).ranked.find((r) => r.supplierId === 'C')!;
    expect(c.points.quality).toBe(0);
    expect(c.points.delivery).toBe(0);
    expect(c.missing).toEqual(['quality', 'delivery']);
    expect(c.verifiedCount).toBe(2);
  });

  it('never improves the score of the offer with the gap', () => {
    for (const criterion of CRITERIA) {
      const withValue = decide([A, B, C]).ranked.find((r) => r.supplierId === 'B')!.score;
      const gap = offer('B', { ...B.values, [criterion]: null });
      const withGap = decide([A, gap, C]).ranked.find((r) => r.supplierId === 'B')!.score;
      expect(withGap).toBeLessThanOrEqual(withValue);
    }
  });

  it('ranks the offer with more verified criteria first when scores are equal', () => {
    // Y: best quality (100), delivery missing (0) -> 50. X: worst quality (0), only delivery (100) -> 50.
    const y = offer('Y', { quality: 1 });
    const x = offer('X', { quality: 2, delivery: 90 });
    const ranked = decide([y, x], { quality: 50, price: 0, co2: 0, delivery: 50 }).ranked;
    expect(ranked.map((r) => [r.supplierId, r.score])).toEqual([['X', 50], ['Y', 50]]);
  });

  it('gives every offer 0 for a criterion nobody has verified', () => {
    expect(decide([C, offer('E', { price: 20 })]).ranked.every((r) => r.points.quality === 0)).toBe(true);
  });
});

describe('decide: weighting and sorting', () => {
  it('uses 25 % each by default', () => {
    // A: 100, 0, 100, 100 -> 75; B: 0, 100, 0, 0 -> 25.
    const ranked = decide([A, B]).ranked;
    expect(ranked.map((r) => [r.supplierId, r.score])).toEqual([['A', 75], ['B', 25]]);
  });

  it('changes the ranking when the weights change', () => {
    const priceOnly: Weights = { quality: 0, price: 100, co2: 0, delivery: 0 };
    expect(decide([A, B], priceOnly).ranked[0]?.supplierId).toBe('B');
  });

  it('breaks a tie by verified criteria, then by lower price', () => {
    const x = offer('X', { quality: 1, price: 20 });
    const y = offer('Y', { quality: 1, price: 19 });
    const ranked = decide([x, y], { quality: 100, price: 0, co2: 0, delivery: 0 }).ranked;
    expect(ranked.map((r) => r.supplierId)).toEqual(['Y', 'X']);
    const noPrice = offer('N', { quality: 1 });
    expect(decide([noPrice, x], { quality: 100, price: 0, co2: 0, delivery: 0 }).ranked[0]?.supplierId).toBe('X');
  });

  it('rejects weights that do not add up to 100 % or are not whole numbers', () => {
    expect(() => decide([A], { quality: 30, price: 30, co2: 30, delivery: 30 })).toThrow('add up to 100');
    expect(() => decide([A], { quality: 25.5, price: 24.5, co2: 25, delivery: 25 })).toThrow('whole number');
    expect(() => decide([A], { quality: -10, price: 60, co2: 25, delivery: 25 })).toThrow('whole number');
  });

  it('rejects a supplier that appears twice', () => {
    expect(() => decide([A, A])).toThrow('only once');
  });

  it('keeps warnings without changing the score', () => {
    const warned = offer('B', B.values, { warnings: ['LkSG country risk: High'] });
    const ranked = decide([A, warned]).ranked;
    expect(ranked.find((r) => r.supplierId === 'B')).toMatchObject({ score: 25, warnings: ['LkSG country risk: High'] });
  });
});

describe('decide: recommendation', () => {
  it('names the first place, its margin and where it is best', () => {
    expect(decide([A, B, C, D]).recommendation).toMatchObject({ supplierId: 'A', runnerUpId: expect.any(String) });
    const rec = decide([A, B]).recommendation!;
    expect(rec).toEqual({ supplierId: 'A', score: 75, runnerUpId: 'B', margin: 50, bestIn: ['quality', 'co2', 'delivery'], couldLead: [] });
  });

  it('has no margin with a single offer', () => {
    expect(decide([A]).recommendation).toMatchObject({ supplierId: 'A', runnerUpId: null, margin: null });
  });

  it('does not call a criterion with weight 0 a strength', () => {
    const rec = decide([A, B], { quality: 0, price: 0, co2: 50, delivery: 50 }).recommendation!;
    expect(rec.bestIn).toEqual(['co2', 'delivery']);
  });
});

describe('rebalanceWeights', () => {
  it('keeps the sum at 100 and spreads the change in proportion', () => {
    const next = rebalanceWeights(DEFAULT_WEIGHTS, 'co2', 40);
    expect(next).toEqual({ quality: 20, price: 20, co2: 40, delivery: 20 });
  });

  it('handles rounding remainders', () => {
    const next = rebalanceWeights(DEFAULT_WEIGHTS, 'price', 30);
    expect(CRITERIA.reduce((s, c) => s + next[c], 0)).toBe(100);
    expect(next.price).toBe(30);
  });

  it('clamps to 0–100 and spreads evenly when the others were all 0', () => {
    expect(rebalanceWeights(DEFAULT_WEIGHTS, 'quality', 140)).toEqual({ quality: 100, price: 0, co2: 0, delivery: 0 });
    const back = rebalanceWeights({ quality: 100, price: 0, co2: 0, delivery: 0 }, 'quality', 70);
    expect(back).toEqual({ quality: 70, price: 10, co2: 10, delivery: 10 });
  });

  it('always gives valid weights for every value', () => {
    for (let v = 0; v <= 100; v++) {
      const next = rebalanceWeights({ quality: 13, price: 41, co2: 7, delivery: 39 }, 'delivery', v);
      expect(() => decide([A], next)).not.toThrow();
    }
  });
});
