import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, decide, nearestFlip, rebalanceWeights, weightSensitivity, type DecisionOffer } from './decision.js';

const offer = (supplierId: string, values: Partial<DecisionOffer['values']>): DecisionOffer => ({
  supplierId,
  values: { quality: null, price: null, co2: null, delivery: null, ...values },
  knockOut: null,
  warnings: [],
});

// GREEN: best quality, CO2, delivery; expensive. CHEAP: best price only.
const GREEN = offer('GREEN', { quality: 0.5, price: 20, co2: 3, delivery: 95 });
const CHEAP = offer('CHEAP', { quality: 1.5, price: 14, co2: 12, delivery: 85 });

describe('weightSensitivity', () => {
  it('finds the price weight at which the cheap offer takes the lead', () => {
    const s = weightSensitivity([GREEN, CHEAP], DEFAULT_WEIGHTS).find((x) => x.criterion === 'price')!;
    // GREEN scores 100 - p, CHEAP scores p. At p = 50 both have 50 points, and the
    // tie-break (same data coverage, then lower price) puts CHEAP first.
    expect(s).toEqual({ criterion: 'price', current: 25, flipsAt: 50, direction: 'up', newLeaderId: 'CHEAP' });
    expect(decide([GREEN, CHEAP], rebalanceWeights(DEFAULT_WEIGHTS, 'price', 50)).recommendation?.supplierId).toBe('CHEAP');
    expect(decide([GREEN, CHEAP], rebalanceWeights(DEFAULT_WEIGHTS, 'price', 49)).recommendation?.supplierId).toBe('GREEN');
  });

  it('reports no change where the leader holds over the whole range', () => {
    const s = weightSensitivity([GREEN, CHEAP], DEFAULT_WEIGHTS).find((x) => x.criterion === 'co2')!;
    expect(s.flipsAt).toBeNull();
  });

  it('picks the nearest change over all criteria', () => {
    const flip = nearestFlip(weightSensitivity([GREEN, CHEAP], DEFAULT_WEIGHTS));
    expect(flip).toMatchObject({ criterion: 'price', flipsAt: 50, newLeaderId: 'CHEAP' });
  });

  it('has nothing to report with a single offer', () => {
    expect(nearestFlip(weightSensitivity([GREEN], DEFAULT_WEIGHTS))).toBeNull();
  });
});
