import { describe, expect, it } from 'vitest';
import { checkWeightLimits, weightBounds, weightsDeviate } from './weights.js';

const defaults = { quality: 22, price: 34, co2: 22, delivery: 22 };

describe('weight limits', () => {
  it('allows 10 to 50 % per criterion, whatever the default', () => {
    expect(weightBounds(defaults).price).toEqual({ min: 10, max: 50 });
    expect(weightBounds(defaults).quality).toEqual({ min: 10, max: 50 });
  });

  it('keeps a company default outside 10–50 % allowed, so reset always works', () => {
    expect(weightBounds({ quality: 5, price: 55, co2: 20, delivery: 20 }).quality).toEqual({ min: 5, max: 50 });
    expect(weightBounds({ quality: 5, price: 55, co2: 20, delivery: 20 }).price).toEqual({ min: 10, max: 55 });
  });

  it('accepts weights inside the range and refuses price at 100 % or CO₂ below 10 %', () => {
    expect(() => checkWeightLimits({ quality: 10, price: 50, co2: 10, delivery: 30 }, defaults)).not.toThrow();
    expect(() => checkWeightLimits({ quality: 0, price: 100, co2: 0, delivery: 0 }, defaults)).toThrow('between 10 % and 50 %');
    expect(() => checkWeightLimits({ quality: 30, price: 35, co2: 5, delivery: 30 }, defaults)).toThrow('co2 must stay between 10 % and 50 %');
  });

  it('knows when weights differ from the defaults', () => {
    expect(weightsDeviate(defaults, { ...defaults })).toBe(false);
    expect(weightsDeviate({ ...defaults, price: 35, co2: 21 }, defaults)).toBe(true);
  });
});
