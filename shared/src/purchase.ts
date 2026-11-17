/**
 * Display calculations for the request form (PLAN.md, section 2).
 * None of these values count in the score.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcDay(isoDate: string): number {
  return Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

/** 2026-12-20 -> "20 Dec 2026". */
export function formatDay(isoDate: string): string {
  return new Date(toUtcDay(isoDate)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export type LeadTimeCheck =
  | { kind: 'no_date' }
  | { kind: 'not_verified'; text: string }
  | { kind: 'in_time'; text: string }
  | { kind: 'too_late'; text: string };

/**
 * Compares a verified lead time with the needed-by date.
 * A missing or unverified lead time never counts as "in time".
 */
export function checkLeadTime(
  verifiedLeadTimeDays: number | null,
  neededBy: string | null,
  today: string,
): LeadTimeCheck {
  if (neededBy === null) return { kind: 'no_date' };
  if (verifiedLeadTimeDays === null) return { kind: 'not_verified', text: 'Lead time not verified' };
  const arrival = toUtcDay(today) + verifiedLeadTimeDays * DAY_MS;
  const days = `Lead time ${verifiedLeadTimeDays} ${verifiedLeadTimeDays === 1 ? 'day' : 'days'}`;
  return arrival <= toUtcDay(neededBy)
    ? { kind: 'in_time', text: `${days}, in time for ${formatDay(neededBy)}` }
    : { kind: 'too_late', text: `${days}, too late for ${formatDay(neededBy)}` };
}

/** Unit price x quantity, rounded to cents. */
export function totalCostEur(unitPriceEur: number, quantity: number): number {
  return Math.round(unitPriceEur * quantity * 100) / 100;
}

/** PCF per piece x quantity, in tonnes CO2e. */
export function totalCo2Tonnes(pcfKgPerPiece: number, quantity: number): number {
  return (pcfKgPerPiece * quantity) / 1000;
}

/** CO2 in euros (PLAN.md, section 3): PCF x quantity / 1000 x CO2 price per tonne. Display only. */
export function co2CostEur(pcfKgPerPiece: number, quantity: number, pricePerTonneEur: number): number {
  return Math.round(totalCo2Tonnes(pcfKgPerPiece, quantity) * pricePerTonneEur * 100) / 100;
}
