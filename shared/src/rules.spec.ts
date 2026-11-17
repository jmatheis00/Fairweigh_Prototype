import { describe, expect, it } from 'vitest';
import { validateRules, validateTargets } from './rules.js';

const ok = { priceMaxAgeDays: 60, co2MaxAgeDays: 365, co2PricePerTonneEur: 80, flagEstimatedCo2: true, co2Targets: { company: 200, buyers: { Thomas: 120 }, groups: {} }, showBuyerTargets: false };

describe('validateRules', () => {
  it('accepts valid rules and records who changed them', () => {
    expect(validateRules(ok, 'Sarah (Scope 3 Manager)', '2026-11-06T12:00:00Z')).toEqual({
      ...ok,
      updatedBy: 'Sarah (Scope 3 Manager)',
      updatedAt: '2026-11-06T12:00:00Z',
    });
  });

  it('rejects values outside the limits, fractions and wrong types', () => {
    expect(() => validateRules({ ...ok, priceMaxAgeDays: 2 }, 'S', 'x')).toThrow('Price age threshold must be a whole number from 7 to 730');
    expect(() => validateRules({ ...ok, co2MaxAgeDays: 400.5 }, 'S', 'x')).toThrow('CO₂ data age threshold');
    expect(() => validateRules({ ...ok, co2PricePerTonneEur: '80' }, 'S', 'x')).toThrow('CO₂ price');
    expect(() => validateRules({ ...ok, flagEstimatedCo2: 'yes' }, 'S', 'x')).toThrow('flagEstimatedCo2');
    expect(() => validateRules(null, 'S', 'x')).toThrow('object');
  });

  it('requires a name and ignores unknown fields such as a score weight', () => {
    expect(() => validateRules(ok, '  ', 'x')).toThrow('Name');
    expect(validateRules({ ...ok, knockOutOnRisk: true }, 'S', 'x')).not.toHaveProperty('knockOutOnRisk');
  });
});

describe('validateTargets', () => {
  it('accepts whole tonnes and refuses a missing company target or negative values', () => {
    expect(validateTargets({ company: 200, buyers: { Thomas: 100 }, groups: { Bearings: 0 } })).toEqual({
      company: 200,
      buyers: { Thomas: 100 },
      groups: { Bearings: 0 },
    });
    expect(() => validateTargets({ company: 0, buyers: {}, groups: {} })).toThrow('Company CO₂ target');
    expect(() => validateTargets({ company: 10, buyers: { Thomas: -5 }, groups: {} })).toThrow('Thomas');
    expect(() => validateTargets({ company: 10, buyers: {}, groups: { Bearings: 2.5 } })).toThrow('Bearings');
  });
});

