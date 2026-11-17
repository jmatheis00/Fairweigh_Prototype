import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, decide, type DecisionOffer } from './decision.js';
import { whatItTakesToLead } from './lead-requirement.js';

const offer = (supplierId: string, values: Partial<DecisionOffer['values']>, extra: Partial<DecisionOffer> = {}): DecisionOffer => ({
  supplierId,
  values: { quality: null, price: null, co2: null, delivery: null, ...values },
  knockOut: null,
  warnings: [],
  ...extra,
});

const A = offer('A', { quality: 0.6, price: 20, co2: 3, delivery: 95 });
const B = offer('B', { quality: 1.2, price: 18, co2: 8, delivery: 97 });
// Cheapest, but quality and delivery are missing.
const GAP = offer('GAP', { price: 13, co2: 9 });

describe('whatItTakesToLead', () => {
  it('says which values would put an offer with gaps in first place, and they really do', () => {
    const r = whatItTakesToLead([A, B, GAP], DEFAULT_WEIGHTS, 'GAP')!;
    expect(r.canLead).toBe(true);
    expect(r.missing).toEqual(['quality', 'delivery']);
    const needed = Object.fromEntries(r.needed!.map((n) => [n.criterion, n.value]));
    // The stated values are enough: fill them in and GAP leads.
    const filled = offer('GAP', { ...GAP.values, quality: needed.quality!, delivery: needed.delivery! });
    expect(decide([A, B, filled], DEFAULT_WEIGHTS).recommendation?.supplierId).toBe('GAP');
    // Within the range of the other offers.
    expect(needed.quality).toBeGreaterThanOrEqual(0.6);
    expect(needed.quality).toBeLessThanOrEqual(1.2);
  });

  it('reports when even the best values would not be enough', () => {
    const weights = { quality: 10, price: 10, co2: 70, delivery: 10 };
    const r = whatItTakesToLead([A, B, GAP], weights, 'GAP')!;
    expect(r.canLead).toBe(false);
    expect(r.needed).toBeNull();
    expect(r.bestCaseRank).toBeGreaterThan(1);
  });

  it('has nothing to say for complete or excluded offers', () => {
    expect(whatItTakesToLead([A, B, GAP], DEFAULT_WEIGHTS, 'A')).toBeNull();
    const excluded = offer('X', { price: 10 }, { knockOut: { reason: 'fine', recordId: 'DOC' } });
    expect(whatItTakesToLead([A, excluded], DEFAULT_WEIGHTS, 'X')).toBeNull();
  });

  it('says any verified value is enough when no other offer has one', () => {
    const p = offer('P', { price: 10 });
    const q = offer('Q', { price: 12 });
    const r = whatItTakesToLead([p, q], { quality: 0, price: 10, co2: 0, delivery: 90 }, 'Q')!;
    expect(r.canLead).toBe(true);
    expect(r.needed?.find((n) => n.criterion === 'delivery')?.value).toBeNull();
  });
});
