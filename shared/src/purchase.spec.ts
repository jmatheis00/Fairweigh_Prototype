import { describe, expect, it } from 'vitest';
import { checkLeadTime, co2CostEur, formatDay, totalCo2Tonnes, totalCostEur } from './purchase.js';

describe('checkLeadTime', () => {
  const today = '2026-11-04';

  it('does nothing without a needed-by date', () => {
    expect(checkLeadTime(4, null, today)).toEqual({ kind: 'no_date' });
  });

  it('says in time when the delivery arrives on or before the date', () => {
    expect(checkLeadTime(4, '2026-11-08', today)).toEqual({ kind: 'in_time', text: 'Lead time 4 days, in time for 8 Nov 2026' });
  });

  it('warns when the lead time is too long', () => {
    expect(checkLeadTime(34, '2026-11-20', today)).toEqual({ kind: 'too_late', text: 'Lead time 34 days, too late for 20 Nov 2026' });
    expect(checkLeadTime(5, '2026-11-08', today).kind).toBe('too_late');
  });

  it('never treats a missing lead time as in time', () => {
    expect(checkLeadTime(null, '2027-12-31', today)).toEqual({ kind: 'not_verified', text: 'Lead time not verified' });
  });

  it('uses the singular for one day', () => {
    expect(checkLeadTime(1, '2026-11-05', today)).toMatchObject({ text: 'Lead time 1 day, in time for 5 Nov 2026' });
  });
});

describe('totals', () => {
  it('multiplies by the quantity', () => {
    expect(totalCostEur(18.36, 10000)).toBe(183600);
    expect(totalCostEur(18.36, 3)).toBe(55.08);
    expect(totalCo2Tonnes(7.4, 10000)).toBe(74);
  });

  it('calculates the CO2 euro value from PLAN.md', () => {
    expect(co2CostEur(7.4, 10000, 75)).toBe(5550);
  });

  it('formats days in English', () => {
    expect(formatDay('2026-12-20')).toBe('20 Dec 2026');
  });
});
