import { quarterOf } from './purchase-stats.js';

/**
 * A reporting period for the dashboards: whole months, both ends included
 * ("2026-04" to "2026-09"). Built only from months that have purchase orders,
 * so a filter can never point at an empty, invented period.
 */
export interface Period {
  /** First month, YYYY-MM. */
  from: string;
  /** Last month, YYYY-MM. */
  to: string;
  /** "Q3 2026", "Sep 2026", "Apr – Sep 2026". */
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09" -> "Sep 2026". */
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;
}

/** "2026-Q3" -> "Q3 2026". */
export function quarterLabel(quarter: string): string {
  return `${quarter.slice(5)} ${quarter.slice(0, 4)}`;
}

export function inPeriod(isoDate: string, p: Period): boolean {
  const month = isoDate.slice(0, 7);
  return month >= p.from && month <= p.to;
}

/** "2026-09" + 3 -> "2026-12". */
export function addPeriodMonths(month: string, n: number): string {
  return addMonths(month, n);
}

function addMonths(month: string, n: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

function monthsBetween(from: string, to: string): number {
  return Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7)) - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7))) + 1;
}

function rangeLabel(from: string, to: string): string {
  if (from === to) return monthLabel(from);
  return from.slice(0, 4) === to.slice(0, 4)
    ? `${MONTHS[Number(from.slice(5, 7)) - 1]} – ${monthLabel(to)}`
    : `${monthLabel(from)} – ${monthLabel(to)}`;
}

/** Any span of whole months, e.g. a custom range in the filter: "Feb – May 2026". */
export function rangePeriod(from: string, to: string): Period {
  return from <= to ? { from, to, label: rangeLabel(from, to) } : { from: to, to: from, label: rangeLabel(to, from) };
}

export function monthPeriod(month: string): Period {
  return { from: month, to: month, label: monthLabel(month) };
}

/** The months of a quarter, e.g. "2026-Q3" -> 2026-07 to 2026-09. */
export function quarterPeriod(quarter: string): Period {
  const year = quarter.slice(0, 4);
  const first = (Number(quarter.slice(6)) - 1) * 3 + 1;
  return { from: `${year}-${String(first).padStart(2, '0')}`, to: `${year}-${String(first + 2).padStart(2, '0')}`, label: quarterLabel(quarter) };
}

/** The period of the same length right before, e.g. Q3 -> Q2, Sep -> Aug. */
export function previousPeriod(p: Period): Period {
  const length = monthsBetween(p.from, p.to);
  const from = addMonths(p.from, -length);
  const to = addMonths(p.from, -1);
  const isQuarter = length === 3 && Number(from.slice(5, 7)) % 3 === 1;
  return isQuarter ? quarterPeriod(quarterOf(`${from}-01`)) : { from, to, label: rangeLabel(from, to) };
}

export interface PeriodOptions {
  /** Every month with orders, oldest first. */
  months: Period[];
  /** Every quarter with orders, oldest first. */
  quarters: Period[];
  /** From the first to the last month with orders. */
  all: Period;
  /** Default: the latest quarter with orders. */
  latest: Period;
}

/** Periods the filter offers, from the order dates. Null without dates. */
export function periodOptions(dates: string[]): PeriodOptions | null {
  if (dates.length === 0) return null;
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))].sort();
  const quarters = [...new Set(dates.map(quarterOf))].sort().map(quarterPeriod);
  return {
    months: months.map(monthPeriod),
    quarters,
    all: { from: months[0]!, to: months.at(-1)!, label: rangeLabel(months[0]!, months.at(-1)!) },
    latest: quarters.at(-1)!,
  };
}
