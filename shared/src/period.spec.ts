import { describe, expect, it } from 'vitest';
import { inPeriod, monthPeriod, periodOptions, previousPeriod, quarterPeriod, rangePeriod } from './period.js';

describe('periods for the dashboard filters', () => {
  it('offers only months and quarters that have orders, the latest quarter first by default', () => {
    const o = periodOptions(['2026-04-03', '2026-05-03', '2026-09-08', '2026-07-01'])!;
    expect(o.months.map((m) => m.label)).toEqual(['Apr 2026', 'May 2026', 'Jul 2026', 'Sep 2026']);
    expect(o.quarters.map((q) => q.label)).toEqual(['Q2 2026', 'Q3 2026']);
    expect(o.all).toEqual({ from: '2026-04', to: '2026-09', label: 'Apr – Sep 2026' });
    expect(o.latest).toEqual({ from: '2026-07', to: '2026-09', label: 'Q3 2026' });
    expect(periodOptions([])).toBeNull();
  });

  it('includes both end months', () => {
    const q3 = quarterPeriod('2026-Q3');
    expect(['2026-06-30', '2026-07-01', '2026-09-30', '2026-10-01'].map((d) => inPeriod(d, q3))).toEqual([false, true, true, false]);
  });

  it('compares with the period of the same length right before, across years', () => {
    expect(previousPeriod(quarterPeriod('2026-Q3')).label).toBe('Q2 2026');
    expect(previousPeriod(quarterPeriod('2026-Q1')).label).toBe('Q4 2025');
    expect(previousPeriod(monthPeriod('2026-01'))).toEqual({ from: '2025-12', to: '2025-12', label: 'Dec 2025' });
    expect(previousPeriod({ from: '2026-04', to: '2026-09', label: 'Apr – Sep 2026' })).toEqual({ from: '2025-10', to: '2026-03', label: 'Oct 2025 – Mar 2026' });
  });
  it('builds a custom range of whole months, in either order, and compares it with the span before', () => {
    expect(rangePeriod('2026-02', '2026-05')).toEqual({ from: '2026-02', to: '2026-05', label: 'Feb – May 2026' });
    expect(rangePeriod('2026-05', '2025-11')).toEqual({ from: '2025-11', to: '2026-05', label: 'Nov 2025 – May 2026' });
    expect(previousPeriod(rangePeriod('2026-02', '2026-05')).label).toBe('Oct 2025 – Jan 2026');
  });
});
