import { describe, expect, it } from 'vitest';
import { checkWeightLimits, weightBounds, weightsDeviate } from './weights.js';

const defaults = { quality: 22, price: 34, co2: 22, delivery: 22 };

describe('weight limits', () => {
  it('allows ±10 points around the company default, never below 0', () => {
    expect(weightBounds(defaults).price).toEqual({ min: 24, max: 44 });
    expect(weightBounds({ quality: 5, price: 45, co2: 25, delivery: 25 }).quality).toEqual({ min: 0, max: 15 });
  });

  it('accepts weights inside the range and refuses price at 100 %', () => {
    expect(() => checkWeightLimits({ quality: 17, price: 44, co2: 17, delivery: 22 }, defaults)).not.toThrow();
    expect(() => checkWeightLimits({ quality: 22, price: 100, co2: 0, delivery: 0 }, defaults)).toThrow('price must stay between 24 % and 44 %');
  });

  it('knows when weights differ from the defaults', () => {
    expect(weightsDeviate(defaults, { ...defaults })).toBe(false);
    expect(weightsDeviate({ ...defaults, price: 35, co2: 21 }, defaults)).toBe(true);
  });
});
