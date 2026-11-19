/**
 * Decision engine (PLAN.md, section 3). Pure code, no AI:
 * 1. Knock-outs first: excluded offers stay visible, without a score.
 * 2. Points 0–100 against a reference value (decision of 8 Nov 2026): 50 = at the
 *    reference, +1 point per 1 % better, −1 per 1 % worse, capped at 0 and 100. Since 18 Nov 2026
 *    quality and delivery count the share of good deliveries (without complaint, on time).
 *    Since 17 Nov 2026 the reference is what we have today: the current supplier
 *    (model B). Published industry averages are shown as context only.
 *    Without benchmarks (not used in the demo) the old rule applies: min-max
 *    over the remaining offers, all values equal or only one value: 100 points.
 * 3. Missing or unverified value: 0 points and a notice. Exception (8 Nov 2026): a supplier that
 *    never delivered gets a score range: low = the weakest quality and delivery of our current suppliers
 *    in the category (used for the ranking), high = their best values (see DecisionOffer.assumed).
 *    Estimated value (19 Nov 2026, see DecisionOffer.estimated): it can hurt but never help, so it gets
 *    at most 50 points (the same as today; at most the middle without benchmarks).
 * 4. Weighting; the weights always add up to 100 %.
 * 5. Sorting: offers with real data before suppliers that never delivered (18 Nov 2026), then
 *    higher score, then more verified criteria, then lower price.
 */

export type Criterion = 'quality' | 'price' | 'co2' | 'delivery';

export const CRITERIA: Criterion[] = ['quality', 'price', 'co2', 'delivery'];

/** Lower is better for complaints, price and CO2; higher is better for on-time delivery. */
export const LOWER_IS_BETTER: Record<Criterion, boolean> = {
  quality: true,
  price: true,
  co2: true,
  delivery: false,
};

export type Weights = Record<Criterion, number>;

export const DEFAULT_WEIGHTS: Weights = { quality: 25, price: 25, co2: 25, delivery: 25 };

/**
 * Reference value per criterion. Since 17 Nov 2026: the current supplier's value
 * (price: what we pay today), with the category average as fallback. The same
 * shape also describes the published industry CO₂ average shown as context.
 */
export interface Benchmark {
  /** In the unit of the criterion: % complaints, EUR per piece, kg CO₂e per piece, % on time. */
  value: number;
  /** Where the value comes from, in plain words, e.g. "Budget of the request (EUR 180,000 for 2,000 pcs)". */
  basis: string;
  kind: 'official' | 'internal';
  /** Short source for a table cell, e.g. "IAI 2023", "Budget", "Our suppliers". */
  short: string;
  /** Link to the published source; null for internal benchmarks. */
  sourceUrl: string | null;
}

export type Benchmarks = Record<Criterion, Benchmark>;

/**
 * How much better (+) or worse (−) a value is than its benchmark, in percent of what we want
 * (decision of 18 Nov 2026): price and CO₂ as less money and less CO₂; quality as more deliveries
 * without a complaint (100 − complaint %); delivery as more deliveries on time. So every percentage
 * is a real one: 99.0 % vs 99.2 % deliveries without a complaint is 0.2 % worse, not "25 % more
 * complaints". This replaced comparing the small complaint and late shares (8 Nov 2026), which made
 * gaps of tenths of a percentage point look huge.
 */
export function percentBetter(criterion: Criterion, value: number, benchmark: number): number {
  if (criterion === 'quality' || criterion === 'delivery') {
    const v = criterion === 'quality' ? 100 - value : value;
    const b = criterion === 'quality' ? 100 - benchmark : benchmark;
    return b > 0 ? (100 * (v - b)) / b : 0;
  }
  return benchmark > 0 ? (100 * (benchmark - value)) / benchmark : 0;
}

/**
 * Points for one value against its benchmark: 50 at the benchmark, +1 point per
 * 1 % better (see percentBetter), capped at 0–100.
 */
export function benchmarkPoints(criterion: Criterion, value: number, benchmark: number): number {
  if (criterion === 'price' || criterion === 'co2') {
    if (benchmark <= 0) return value <= 0 ? 100 : 0;
  }
  return Math.max(0, Math.min(100, 50 + percentBetter(criterion, value, benchmark)));
}

export interface KnockOut {
  reason: string;
  /** Record or document that proves the violation. */
  recordId: string;
}

export interface DecisionOffer {
  supplierId: string;
  /** Only verified values; null if missing or not verified. */
  values: Record<Criterion, number | null>;
  knockOut: KnockOut | null;
  /** Shown next to the offer; never change the score. */
  warnings: string[];
  /**
   * Values used instead of a missing one (decision of 8 Nov 2026): a supplier that never
   * delivered gets the weakest quality and delivery of our current suppliers in the category.
   * Shown as "assumed"; never better than a supplier with real data.
   */
  assumed?: Partial<Record<Criterion, number>>;
  /** The same criteria with the best values of our current suppliers: the high end of the score range. */
  assumedBest?: Partial<Record<Criterion, number>>;
  /**
   * Criteria whose value is only an estimate, not the supplier's figure for this part (19 Nov 2026):
   * CO₂ as a company estimate or an industry average. Such a value can hurt but never help: it gets
   * at most 50 points, so it never counts better than today.
   */
  estimated?: Criterion[];
}

export interface RankedOffer {
  rank: number;
  supplierId: string;
  /** 0–100, rounded to one decimal. */
  score: number;
  /** Points per criterion before weighting, 0–100. */
  points: Record<Criterion, number>;
  verifiedCount: number;
  missing: Criterion[];
  /** Criteria scored with an assumed value instead of a verified one. */
  assumed: Criterion[];
  /**
   * Score range for a supplier without deliveries: low = weakest values of our current suppliers
   * (this is `score`, used for the ranking), high = their best values. Null for offers with real data.
   */
  scoreRange: { low: number; high: number } | null;
  /** Points per criterion at the high end of the range (only for assumed criteria). */
  pointsHigh: Partial<Record<Criterion, number>> | null;
  /** Estimated criteria that would have scored better than today and were held at today (50 points). */
  capped: Criterion[];
  warnings: string[];
}

export interface ExcludedOffer {
  supplierId: string;
  knockOut: KnockOut;
  warnings: string[];
}

export interface Recommendation {
  supplierId: string;
  score: number;
  /** Points ahead of second place; null if there is no second place. */
  runnerUpId: string | null;
  margin: number | null;
  /** Criteria in which the recommended offer has the most points (ties included). */
  bestIn: Criterion[];
  /** Suppliers without deliveries whose high end would beat the recommendation: qualify them first (sample delivery). */
  couldLead: { supplierId: string; high: number }[];
}

export interface DecisionResult {
  ranked: RankedOffer[];
  excluded: ExcludedOffer[];
  recommendation: Recommendation | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Throws unless every weight is a whole number from 0 to 100 and they add up to 100. */
export function assertWeights(weights: Weights): void {
  for (const c of CRITERIA) {
    const w = weights[c];
    if (!Number.isInteger(w) || w < 0 || w > 100) {
      throw new Error(`Weight for ${c} must be a whole number from 0 to 100, got ${w}`);
    }
  }
  const sum = CRITERIA.reduce((s, c) => s + weights[c], 0);
  if (sum !== 100) throw new Error(`Weights must add up to 100 %, got ${sum} %`);
}

/** An estimated value never scores better than today: at most 50 points (see DecisionOffer.estimated). */
export const ESTIMATE_MAX_POINTS = 50;

/** Min-max points for one criterion. Missing values get 0 and do not shift min or max. */
function normalise(values: (number | null)[], lowerIsBetter: boolean): number[] {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (present.length === 0) return values.map(() => 0);
  const min = Math.min(...present);
  const max = Math.max(...present);
  return values.map((v) => {
    if (v === null || !Number.isFinite(v)) return 0;
    if (max === min) return 100;
    return lowerIsBetter ? ((max - v) / (max - min)) * 100 : ((v - min) / (max - min)) * 100;
  });
}

export function decide(offers: DecisionOffer[], weights: Weights = DEFAULT_WEIGHTS, benchmarks: Benchmarks | null = null): DecisionResult {
  assertWeights(weights);
  const ids = offers.map((o) => o.supplierId);
  if (new Set(ids).size !== ids.length) throw new Error('Each supplier may appear only once');

  // 1. Knock-outs first.
  const excluded: ExcludedOffer[] = offers
    .filter((o) => o.knockOut !== null)
    .map((o) => ({ supplierId: o.supplierId, knockOut: o.knockOut!, warnings: o.warnings }));
  const remaining = offers.filter((o) => o.knockOut === null);

  // 2. + 3. Points against the benchmark (or min-max without one); missing values get 0.
  const rawPointsByCriterion = Object.fromEntries(
    CRITERIA.map((c) => [
      c,
      benchmarks
        ? remaining.map((o) => {
            const v = o.values[c] ?? o.assumed?.[c] ?? null;
            return v === null || !Number.isFinite(v) ? 0 : benchmarkPoints(c, v, benchmarks[c].value);
          })
        : normalise(remaining.map((o) => o.values[c] ?? o.assumed?.[c] ?? null), LOWER_IS_BETTER[c]),
    ]),
  ) as Record<Criterion, number[]>;
  // An estimate can hurt but never help (19 Nov 2026).
  const isCapped = (o: DecisionOffer, c: Criterion, points: number) =>
    o.values[c] !== null && (o.estimated?.includes(c) ?? false) && points > ESTIMATE_MAX_POINTS;
  const pointsByCriterion = Object.fromEntries(
    CRITERIA.map((c) => [c, rawPointsByCriterion[c].map((p, i) => (isCapped(remaining[i]!, c, p) ? ESTIMATE_MAX_POINTS : p))]),
  ) as Record<Criterion, number[]>;

  // 4. Weight.
  const unsorted = remaining.map((offer, i) => {
    const points = Object.fromEntries(CRITERIA.map((c) => [c, pointsByCriterion[c][i]!])) as Record<Criterion, number>;
    const raw = CRITERIA.reduce((sum, c) => sum + (points[c] * weights[c]) / 100, 0);
    const missing = CRITERIA.filter((c) => offer.values[c] === null);
    const assumed = missing.filter((c) => offer.assumed?.[c] !== undefined);
    // High end of the range: the assumed criteria with the best values of our current suppliers.
    const best = assumed.filter((c) => offer.assumedBest?.[c] !== undefined);
    const pointsHigh =
      benchmarks && best.length
        ? (Object.fromEntries(best.map((c) => [c, benchmarkPoints(c, offer.assumedBest![c]!, benchmarks[c].value)])) as Partial<Record<Criterion, number>>)
        : null;
    const rawHigh = pointsHigh
      ? CRITERIA.reduce((sum, c) => sum + ((pointsHigh[c] ?? points[c]) * weights[c]) / 100, 0)
      : null;
    return {
      supplierId: offer.supplierId,
      raw,
      points: Object.fromEntries(CRITERIA.map((c) => [c, round1(points[c])])) as Record<Criterion, number>,
      verifiedCount: CRITERIA.length - missing.length,
      missing,
      assumed,
      rawHigh,
      pointsHigh: pointsHigh ? (Object.fromEntries(Object.entries(pointsHigh).map(([c, v]) => [c, round1(v)])) as Partial<Record<Criterion, number>>) : null,
      capped: CRITERIA.filter((c) => isCapped(offer, c, rawPointsByCriterion[c][i]!)),
      warnings: offer.warnings,
      price: offer.values.price,
    };
  });

  // 5. Sort: offers with real data first (decision of 18 Nov 2026: a supplier that never delivered
  // is never ranked above one with real data, so a gap never beats real data), then score,
  // then verified criteria, then lower price (missing price last).
  unsorted.sort((a, b) => {
    const byData = (a.assumed.length > 0 ? 1 : 0) - (b.assumed.length > 0 ? 1 : 0);
    if (byData !== 0) return byData;
    const byScore = round1(b.raw) - round1(a.raw);
    if (byScore !== 0) return byScore;
    if (b.verifiedCount !== a.verifiedCount) return b.verifiedCount - a.verifiedCount;
    return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
  });

  const ranked: RankedOffer[] = unsorted.map((o, i) => ({
    rank: i + 1,
    supplierId: o.supplierId,
    score: round1(o.raw),
    points: o.points,
    verifiedCount: o.verifiedCount,
    missing: o.missing,
    assumed: o.assumed,
    scoreRange: o.rawHigh !== null ? { low: round1(o.raw), high: round1(o.rawHigh) } : null,
    pointsHigh: o.pointsHigh,
    capped: o.capped,
    warnings: o.warnings,
  }));

  const first = ranked[0];
  const second = ranked[1];
  const recommendation: Recommendation | null = first
    ? {
        supplierId: first.supplierId,
        score: first.score,
        runnerUpId: second?.supplierId ?? null,
        margin: second ? round1(first.score - second.score) : null,
        bestIn: CRITERIA.filter(
          (c) => weights[c] > 0 && first.points[c] > 0 && ranked.every((r) => r.points[c] <= first.points[c]),
        ),
        couldLead: ranked
          .filter((r) => r.supplierId !== first.supplierId && r.scoreRange && r.scoreRange.high > first.score)
          .map((r) => ({ supplierId: r.supplierId, high: r.scoreRange!.high })),
      }
    : null;

  return { ranked, excluded, recommendation };
}

/**
 * Changes one weight and spreads the difference over the others in
 * proportion, so the sum stays exactly 100.
 */
export function rebalanceWeights(weights: Weights, changed: Criterion, value: number): Weights {
  const target = Math.max(0, Math.min(100, Math.round(value)));
  const others = CRITERIA.filter((c) => c !== changed);
  const rest = 100 - target;
  const otherSum = others.reduce((s, c) => s + weights[c], 0);

  const next = { ...weights, [changed]: target };
  // Shares of the others; equal if they were all 0.
  const shares = others.map((c) => (otherSum === 0 ? rest / others.length : (weights[c] / otherSum) * rest));
  const floors = shares.map(Math.floor);
  let leftover = rest - floors.reduce((s, n) => s + n, 0);
  // Give the rounding remainder to the largest fractions first.
  const order = shares.map((s, i) => ({ i, frac: s - floors[i]! })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (leftover <= 0) break;
    floors[i]! += 1;
    leftover -= 1;
  }
  others.forEach((c, i) => {
    next[c] = floors[i]!;
  });
  return next;
}

/** Where the recommendation would change when one weight moves (others scale in proportion). */
export interface WeightSensitivity {
  criterion: Criterion;
  /** Current weight of this criterion. */
  current: number;
  /** First weight (whole percent) at which another offer leads; null if none in 0–100. */
  flipsAt: number | null;
  direction: 'up' | 'down' | null;
  newLeaderId: string | null;
}

function leaderOf(offers: DecisionOffer[], weights: Weights, benchmarks: Benchmarks | null): string | null {
  return decide(offers, weights, benchmarks).recommendation?.supplierId ?? null;
}

/**
 * Robustness of the recommendation: for each criterion, the nearest weight
 * at which the first place changes. The other weights keep their proportions
 * (rebalanceWeights), so the sum stays 100 %.
 */
export function weightSensitivity(offers: DecisionOffer[], weights: Weights, benchmarks: Benchmarks | null = null): WeightSensitivity[] {
  const leader = leaderOf(offers, weights, benchmarks);
  return CRITERIA.map((criterion) => {
    const current = weights[criterion];
    const none: WeightSensitivity = { criterion, current, flipsAt: null, direction: null, newLeaderId: null };
    if (leader === null) return none;
    const find = (step: 1 | -1) => {
      for (let w = current + step; w >= 0 && w <= 100; w += step) {
        const other = leaderOf(offers, rebalanceWeights(weights, criterion, w), benchmarks);
        if (other !== leader) return { w, other };
      }
      return null;
    };
    const up = find(1);
    const down = find(-1);
    const best =
      up && down ? (up.w - current <= current - down.w ? { ...up, dir: 'up' as const } : { ...down, dir: 'down' as const })
      : up ? { ...up, dir: 'up' as const }
      : down ? { ...down, dir: 'down' as const }
      : null;
    return best ? { criterion, current, flipsAt: best.w, direction: best.dir, newLeaderId: best.other } : none;
  });
}

/** The single nearest change over all criteria, or null if the leader holds everywhere. */
export function nearestFlip(sensitivities: WeightSensitivity[]): WeightSensitivity | null {
  const flips = sensitivities.filter((s) => s.flipsAt !== null);
  if (flips.length === 0) return null;
  return flips.reduce((a, b) => (Math.abs(b.flipsAt! - b.current) < Math.abs(a.flipsAt! - a.current) ? b : a));
}

/** Weakest quality and delivery among our current suppliers of a category, for suppliers without deliveries. */
export interface NewSupplierAssumption {
  /** Highest complaint rate (%) among the current suppliers of the category: low end of the range. */
  quality: number;
  /** Lowest on-time delivery (%) among the current suppliers of the category: low end of the range. */
  delivery: number;
  /** Lowest complaint rate (%) among them: high end of the range. */
  qualityBest: number;
  /** Highest on-time delivery (%) among them: high end of the range. */
  deliveryBest: number;
  /** How many current suppliers the values come from. */
  peers: number;
}

/**
 * Fills missing quality and delivery of suppliers that never delivered with the weakest values of
 * our current suppliers in the category. Other gaps (and unverified values) still get 0 points.
 */
export function withAssumedValues(offers: DecisionOffer[], assumption: NewSupplierAssumption | null, neverDelivered: Set<string>): DecisionOffer[] {
  if (!assumption) return offers;
  return offers.map((o) => {
    if (!neverDelivered.has(o.supplierId)) return o;
    const assumed: Partial<Record<Criterion, number>> = {};
    const assumedBest: Partial<Record<Criterion, number>> = {};
    if (o.values.quality === null) {
      assumed.quality = assumption.quality;
      assumedBest.quality = assumption.qualityBest;
    }
    if (o.values.delivery === null) {
      assumed.delivery = assumption.delivery;
      assumedBest.delivery = assumption.deliveryBest;
    }
    return Object.keys(assumed).length ? { ...o, assumed, assumedBest } : o;
  });
}
