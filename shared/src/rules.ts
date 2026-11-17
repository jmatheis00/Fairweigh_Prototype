import type { Co2Targets } from './co2-targets.js';
/**
 * Rules the Scope 3 manager sets for buyers (PLAN.md section 9, 6 Nov 2026).
 * They only create warnings and the CO₂ euro display; they never change the
 * score. Knock-outs (proven violation) and "missing data = 0 points" stay
 * fixed in code.
 */
export interface BuyerRules {
  /** Prices older than this many days show "outdated". */
  priceMaxAgeDays: number;
  /** CO₂ values older than this many days show "old CO₂ data". */
  co2MaxAgeDays: number;
  /** EUR per tonne CO₂e, only for the euro display. */
  co2PricePerTonneEur: number;
  /** Flag offers whose CO₂ value is estimated instead of supplier-specific. */
  flagEstimatedCo2: boolean;
  /** CO₂ saving targets for this year: company, buyers, commodity groups (10 Nov 2026). */
  co2Targets: Co2Targets;
  /** Whether the target achievement per buyer is shown to others (it can affect bonus talks). Each buyer always sees their own. */
  showBuyerTargets: boolean;
  /** Who changed the rules last, and when (ISO); null for the defaults. */
  updatedBy: string | null;
  updatedAt: string | null;
}

export const RULE_LIMITS = {
  priceMaxAgeDays: { min: 7, max: 730 },
  co2MaxAgeDays: { min: 30, max: 3650 },
  co2PricePerTonneEur: { min: 0, max: 1000 },
} as const;

type NumericRule = keyof typeof RULE_LIMITS;

const LABEL: Record<NumericRule, string> = {
  priceMaxAgeDays: 'Price age threshold',
  co2MaxAgeDays: 'CO₂ data age threshold',
  co2PricePerTonneEur: 'CO₂ price',
};

/**
 * Checks a change from the rules page. Returns the new rules or throws with a
 * message the user can act on. Only known fields are accepted.
 */
export function validateRules(input: unknown, updatedBy: string, now: string): BuyerRules {
  if (typeof input !== 'object' || input === null) throw new Error('Rules must be an object');
  const r = input as Record<string, unknown>;
  const num = (key: NumericRule): number => {
    const value = r[key];
    const { min, max } = RULE_LIMITS[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${LABEL[key]} must be a whole number from ${min} to ${max}`);
    }
    return value;
  };
  if (typeof r.flagEstimatedCo2 !== 'boolean') throw new Error('flagEstimatedCo2 must be true or false');
  const by = updatedBy.trim();
  if (by.length === 0 || by.length > 80) throw new Error('Name of the person changing the rules is required');
  return {
    priceMaxAgeDays: num('priceMaxAgeDays'),
    co2MaxAgeDays: num('co2MaxAgeDays'),
    co2PricePerTonneEur: num('co2PricePerTonneEur'),
    co2Targets: validateTargets(r.co2Targets),
    showBuyerTargets: r.showBuyerTargets === undefined ? true : bool(r.showBuyerTargets, 'showBuyerTargets'),
    flagEstimatedCo2: r.flagEstimatedCo2,
    updatedBy: by,
    updatedAt: now,
  };
}

/** Highest target in tonnes, to catch typing errors. */
export const MAX_TARGET_TONNES = 100000;

function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} must be true or false`);
  return value;
}

function tonnes(value: unknown, label: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > MAX_TARGET_TONNES) {
    throw new Error(`${label} must be a whole number of tonnes from ${min} to ${MAX_TARGET_TONNES}`);
  }
  return value;
}

/** Checks the CO₂ targets: whole tonnes, the company target at least 1 t. */
export function validateTargets(input: unknown): Co2Targets {
  if (typeof input !== 'object' || input === null) throw new Error('CO₂ targets are required');
  const t = input as Record<string, unknown>;
  const record = (value: unknown, what: string): Record<string, number> => {
    if (typeof value !== 'object' || value === null) throw new Error(`${what} targets are required`);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, tonnes(v, `CO₂ target of ${k}`, 0)]));
  };
  return { company: tonnes(t.company, 'Company CO₂ target', 1), buyers: record(t.buyers, 'Buyer'), groups: record(t.groups, 'Commodity group') };
}
