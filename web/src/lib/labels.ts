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
 * many percent better (+) or worse (−) an offer is than today on each criterion, so the buyer reads
 * "Ø 9 % better than today" instead of "59 / 100".
 */
export const vsToday = (score: number): number => score - 50;

/** Points of one criterion as % against today: "-0.2 %", "+40 %" (one decimal below 10 %). */
export function formatCriterionVsToday(points: number): string {
  const d = points - 50;
  const digits = Math.abs(d) < 10 ? 1 : 0;
  const r = Number(d.toFixed(digits));
  return `${r > 0 ? "+" : r < 0 ? "-" : "±"}${formatNumber(Math.abs(r), digits)} %`;
}

/** Short form for tables: "+9 %", "-19 %", "±0 %". */
export function formatVsTodayShort(score: number, digits = 0): string {
  const d = Number(vsToday(score).toFixed(digits));
  return `${d > 0 ? "+" : d < 0 ? "-" : "±"}${formatNumber(Math.abs(d), digits)} %`;
}

/** Long form: "Ø 9 % better than today", "Ø 19 % worse than today", "Same as today". */
export function formatVsToday(score: number, digits = 0): string {
  const d = Number(vsToday(score).toFixed(digits));
  if (d === 0) return "Same as today";
  return `Ø ${formatNumber(Math.abs(d), digits)} % ${d > 0 ? "better" : "worse"} than today`;
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
