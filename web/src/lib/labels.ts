import { SOURCE_SYSTEMS, type EvidenceTopic, type SourceSystem } from "@scc/shared";

export const TOPIC_LABEL: Record<EvidenceTopic, string> = {
  quality: "Product quality",
  price: "Price",
  co2: "CO₂",
  delivery: "Delivery reliability",
  leadTime: "Lead time",
  compliance: "Compliance",
};

/** Order in the table: the four criteria first, then the extras. */
export const TOPIC_ORDER: EvidenceTopic[] = ["quality", "price", "co2", "delivery", "leadTime", "compliance"];

/** Names of the simulated systems, one folder each in data/sources/. */
export const SYSTEM_LABEL: Record<SourceSystem, string> = {
  erp: SOURCE_SYSTEMS.erp.label,
  ratings: SOURCE_SYSTEMS.ratings.label,
  pcf: SOURCE_SYSTEMS.pcf.label,
  documents: SOURCE_SYSTEMS.documents.label,
};

/** Numbers in English format, e.g. 183,600.00. */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Money as "7,419 €" (number first, then €); the sign is the plain hyphen. */
export function formatEur(value: number, decimals = 0): string {
  return `${value < 0 ? "-" : ""}${formatNumber(Math.abs(value), decimals)} €`;
}

/** Signed money, e.g. "+500 €", "-1,200 €", "±0 €". */
export function formatSignedEur(value: number, decimals = 0): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : "±"}${formatEur(Math.abs(value), decimals)}`;
}

/** Evidence units come from the data ("EUR/pc"); the screen shows the euro sign. */
export function displayUnit(unit: string): string {
  return unit.replace(/\bEUR\b/g, "€");
}

/** "2026-09-15" -> "Sep 2026": the "as of" date under a value. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatMonth(isoDate: string): string {
  return `${MONTHS[Number(isoDate.slice(5, 7)) - 1] ?? ""} ${isoDate.slice(0, 4)}`;
}

/** Short label for a knock-out reason (decision engine, rules K2/K3 and fine notices). */
export function knockOutLabel(reason: string): string {
  if (reason.startsWith("LkSG")) return "Excluded: LkSG, no audit";
  if (reason.startsWith("Child or forced labour")) return "Excluded: child or forced labour";
  return "Excluded: proven violation";
}

/** Age notes that the matrix shows as a date in the cell instead of a note. */
export const AGE_NOTE = /^(Price outdated|CO₂ data outdated)/;

/** 2026-11-04T15:27:16.818Z -> "4 Nov 2026, 16:27" (local time). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The score shown against today (decision of 18 Nov 2026): score − 50 is the weighted average of how
 * many percent better or worse an offer is than today on each criterion, so the buyer reads
 * "9 % better than today" instead of "59 / 100".
 */
export const vsToday = (score: number): number => score - 50;

/**
 * Mark for a value that matches today (19 Nov 2026): a plain dash instead of the word "same", which
 * repeated in every cell of the current supplier and in every range. The "vs today" column header
 * says what the dash means; tooltips and screen-reader labels still say "same as today".
 */
export const AS_TODAY = "–";

/**
 * Better/worse in words, never with a sign (feedback 18 Nov 2026): "+9 %" could be read as
 * "9 % more price or CO₂", so signs are kept only for raw changes such as "+0.85 €/pc".
 * d is the difference in % against today (positive = better): "9 % better", "0.2 % worse", "–".
 */
export function formatDiff(d: number, digits = 0, zero = AS_TODAY): string {
  const r = Number(d.toFixed(digits));
  if (r === 0) return zero;
  return `${formatNumber(Math.abs(r), digits)} % ${r > 0 ? "better" : "worse"}`;
}

/**
 * A range in words: "2–3 % better", "7–9 % worse", "3 % worse to 2 % better". A range that starts or
 * ends at today says "up to 2 % better" / "up to 3 % worse" (19 Nov 2026, instead of "same to 2 % better").
 */
export function formatDiffRange(low: number, high: number, digits = 0): string {
  const lo = Number(low.toFixed(digits));
  const hi = Number(high.toFixed(digits));
  if (lo === hi) return formatDiff(lo, digits);
  if (lo === 0 && hi > 0) return `up to ${formatNumber(hi, digits)} % better`;
  if (hi === 0 && lo < 0) return `up to ${formatNumber(-lo, digits)} % worse`;
  if (lo > 0 && hi > 0) return `${formatNumber(lo, digits)}–${formatNumber(hi, digits)} % better`;
  if (lo < 0 && hi < 0) return `${formatNumber(-hi, digits)}–${formatNumber(-lo, digits)} % worse`;
  return `${formatDiff(lo, digits)} to ${formatDiff(hi, digits)}`;
}

/** Digits for one criterion: one decimal below 10 %, so 0.2 % does not round away. */
const criterionDigits = (d: number) => (Math.abs(d) < 10 ? 1 : 0);

/** Points of one criterion against today in words: "41 % better", "0.2 % worse", "–" (as today). */
export function formatCriterionVsToday(points: number): string {
  const d = points - 50;
  return formatDiff(d, criterionDigits(d));
}

/** Range of one criterion (supplier that never delivered): "0.4 % worse to 0.4 % better". */
export function formatCriterionRange(lowPoints: number, highPoints: number): string {
  const lo = lowPoints - 50;
  const hi = highPoints - 50;
  return formatDiffRange(lo, hi, Math.max(criterionDigits(lo), criterionDigits(hi)));
}

/** Short form for tables and lists: "9 % better", "19 % worse", "–" (as today). */
export function formatVsTodayShort(score: number, digits = 0): string {
  return formatDiff(vsToday(score), digits);
}

/** Range of a supplier that never delivered: "2–3 % better". */
export function formatVsTodayRange(low: number, high: number, digits = 0): string {
  return formatDiffRange(vsToday(low), vsToday(high), digits);
}

/** Long form: "9 % better than today", "19 % worse than today", "Same as today". */
export function formatVsToday(score: number, digits = 0): string {
  const short = formatVsTodayShort(score, digits);
  return short === AS_TODAY ? "Same as today" : `${short} than today`;
}

/**
 * Score bands against today (18 Nov 2026): 5 % or more better, about the same (within ±5 %), 5 % or
 * more worse; the same limit as the arrows per criterion. Colour always comes with the word (tooltip
 * and screen-reader label), never alone.
 */
export type ScoreBand = "better" | "same" | "worse";

export const SCORE_BAND_LIMIT = 5;

export function scoreBand(score: number): ScoreBand {
  const d = vsToday(score);
  if (d >= SCORE_BAND_LIMIT) return "better";
  if (d <= -SCORE_BAND_LIMIT) return "worse";
  return "same";
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  better: `Better than today (${SCORE_BAND_LIMIT} % or more)`,
  same: `About the same as today (within ±${SCORE_BAND_LIMIT} %)`,
  worse: `Worse than today (${SCORE_BAND_LIMIT} % or more)`,
};

/** Short product names for filter chips; the full name is in the tooltip. */
const SHORT_PART: Record<string, string> = {
  "P-ALU-HSG-01": "Aluminium GH-200",
  "P-STL-HSG-01": "Steel housing",
  "P-CU-WIRE-01": "Copper wire",
};

export function shortPartName(partId: string, fullName: string): string {
  return SHORT_PART[partId] ?? fullName.split(",")[0]!;
}
