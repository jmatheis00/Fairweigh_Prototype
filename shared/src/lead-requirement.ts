import { CRITERIA, LOWER_IS_BETTER, decide, type Benchmarks, type Criterion, type DecisionOffer, type Weights } from './decision.js';

/**
 * "What would it take": for an offer with gaps, which verified values would
 * put it in first place? All missing values move together from the worst to
 * the best value among the other offers; the first position that wins is
 * reported. If even the best values are not enough, that is reported too.
 * Pure code, no AI.
 */
export interface LeadRequirement {
  supplierId: string;
  missing: Criterion[];
  canLead: boolean;
  /** Values that would be enough, per missing criterion; null value = any verified value is enough. */
  needed: { criterion: Criterion; value: number | null }[] | null;
  /** Result if every missing value were the best among the other offers. */
  bestCaseScore: number;
  bestCaseRank: number;
}

const DECIMALS: Record<Criterion, number> = { quality: 1, price: 2, co2: 1, delivery: 0 };

/** Rounds towards "stricter", so the stated value is always enough. */
function roundStrict(value: number, criterion: Criterion): number {
  const f = 10 ** DECIMALS[criterion];
  return LOWER_IS_BETTER[criterion] ? Math.floor(value * f) / f : Math.ceil(value * f) / f;
}

export function whatItTakesToLead(
  offers: DecisionOffer[],
  weights: Weights,
  supplierId: string,
  benchmarks: Benchmarks | null = null,
): LeadRequirement | null {
  const offer = offers.find((o) => o.supplierId === supplierId);
  if (!offer || offer.knockOut) return null;
  const missing = CRITERIA.filter((c) => offer.values[c] === null);
  if (missing.length === 0) return null;

  const others = offers.filter((o) => o.supplierId !== supplierId && !o.knockOut);
  const range = Object.fromEntries(
    missing.map((c) => {
      const values = others.map((o) => o.values[c]).filter((v): v is number => v !== null);
      if (values.length === 0) return [c, null];
      const best = LOWER_IS_BETTER[c] ? Math.min(...values) : Math.max(...values);
      const worst = LOWER_IS_BETTER[c] ? Math.max(...values) : Math.min(...values);
      return [c, { best, worst }];
    }),
  ) as Record<Criterion, { best: number; worst: number } | null>;

  const valuesAt = (t: number) =>
    Object.fromEntries(
      missing.map((c) => {
        const r = range[c];
        // Without any other value, every verified value gets 100 points; the number does not matter.
        return [c, r ? r.worst + t * (r.best - r.worst) : 1];
      }),
    ) as Record<Criterion, number>;

  const evaluate = (t: number) => {
    const filled = valuesAt(t);
    const changed = offers.map((o) => (o.supplierId === supplierId ? { ...o, values: { ...o.values, ...filled } } : o));
    const result = decide(changed, weights, benchmarks);
    const own = result.ranked.find((r) => r.supplierId === supplierId)!;
    return { leads: result.recommendation?.supplierId === supplierId, score: own.score, rank: own.rank, filled };
  };

  const best = evaluate(1);
  if (!best.leads) {
    return { supplierId, missing, canLead: false, needed: null, bestCaseScore: best.score, bestCaseRank: best.rank };
  }
  for (let step = 0; step <= 100; step++) {
    const attempt = evaluate(step / 100);
    if (attempt.leads) {
      return {
        supplierId,
        missing,
        canLead: true,
        needed: missing.map((c) => ({ criterion: c, value: range[c] ? roundStrict(attempt.filled[c], c) : null })),
        bestCaseScore: best.score,
        bestCaseRank: best.rank,
      };
    }
  }
  return { supplierId, missing, canLead: true, needed: null, bestCaseScore: best.score, bestCaseRank: best.rank };
}
