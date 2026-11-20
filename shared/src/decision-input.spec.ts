import { describe, expect, it } from 'vitest';
import type { AgentRun, Evidence } from './agent.js';
import { buildDecisionInput, daysBetween } from './decision-input.js';

/** Knock-outs and warnings decide what the buyer sees, so every rule is tested. */
let n = 0;
function ev(overrides: Partial<Evidence>): Evidence {
  n += 1;
  return {
    evidenceId: `e${n}`, supplierId: 'S-1', topic: 'quality', value: 1, unit: '%', sentence: '',
    system: 'erp', recordId: 'ERP-S-1', location: { kind: 'field', field: 'complaintRatePercent' },
    retrievedAt: '2026-11-04T10:00:00Z', status: 'verified', checkFailures: [],
    sourceDocumentType: null, sourceDate: null, sourceBadge: null, ...overrides,
  };
}

function run(evidence: Evidence[], neededBy: string | null = null): AgentRun {
  return {
    runId: 'r', request: { partId: 'P', supplierIds: ['S-1'], quantity: 100, neededBy },
    mode: { kind: 'fake' }, status: 'completed', startedAt: '', finishedAt: '', steps: [], evidence, gaps: [], error: null,
  };
}

const options = { today: '2026-11-05', priceMaxAgeDays: 90, co2MaxAgeDays: 365 };
const input = (evidence: Evidence[], neededBy: string | null = null) => buildDecisionInput(run(evidence, neededBy), options)[0]!;

const fine = (overrides: Partial<Evidence> = {}) =>
  ev({
    topic: 'compliance', value: 'Fine for wastewater', unit: 'text', system: 'documents', recordId: 'DOC-FINE-S-1',
    location: { kind: 'document', page: 1, quote: 'Decision: Fine for wastewater' },
    sourceDocumentType: 'fine_notice', sourceDate: '2024-06-12', ...overrides,
  });
const price = (overrides: Partial<Evidence> = {}) =>
  ev({
    topic: 'price', value: 18.36, unit: 'EUR/piece', system: 'documents', recordId: 'DOC-OFFER-S-1',
    location: { kind: 'document', page: 1, quote: 'Unit price: EUR 18.36 per piece' },
    sourceDocumentType: 'offer', sourceDate: '2026-10-12', ...overrides,
  });

describe('knock-out', () => {
  it('excludes an offer with a verified fine notice', () => {
    expect(input([fine()]).knockOut).toEqual({
      reason: 'Proven violation: Fine for wastewater (12 Jun 2024)',
      recordId: 'DOC-FINE-S-1',
    });
  });

  it('never excludes because of an unverified fine notice', () => {
    expect(input([fine({ status: 'not_verified' })]).knockOut).toBeNull();
  });

  const controversy = (value: string) =>
    ev({ topic: 'compliance', value, unit: 'text', system: 'ratings', recordId: 'RAT-S-1', location: { kind: 'field', field: 'controversies' } });
  const risk = (value: string, socialAudit: boolean | null) =>
    ev({ topic: 'compliance', value, unit: 'text', system: 'ratings', recordId: 'RAT-S-1', location: { kind: 'field', field: 'lksgCountryRisk' }, socialAudit });

  it('K2: excludes high LkSG risk without a social audit, but only warns with SA8000 or medium risk', () => {
    expect(input([risk('High', false)]).knockOut).toEqual({ reason: 'LkSG country risk High without a valid social audit (SA8000)', recordId: 'RAT-S-1' });
    const audited = input([risk('High', true)]);
    expect(audited.knockOut).toBeNull();
    expect(audited.warnings).toEqual(['LkSG country risk: High']);
    expect(input([risk('Medium', false)]).knockOut).toBeNull();
    // Unknown audit status never excludes.
    expect(input([risk('High', null)]).knockOut).toBeNull();
    expect(input([risk('Medium', false)]).warnings).toEqual(['LkSG country risk: Medium']);
    // Low is no warning at all.
    expect(input([risk('Low', false)]).warnings).toEqual([]);
  });

  it('K3: excludes a child or forced labour controversy; other controversies stay warnings', () => {
    expect(input([controversy('2025: NGO report on child labour at rubber plantations')]).knockOut?.reason).toContain('Child or forced labour reported');
    expect(input([controversy('Forced labor found in audit')]).knockOut).not.toBeNull();
    const other = input([controversy('2024: excessive overtime found in labour audit')]);
    expect(other.knockOut).toBeNull();
    expect(other.warnings).toEqual(['Reported: 2024: excessive overtime found in labour audit']);
  });

  it('"None known" from the rating partner is no controversy and no warning', () => {
    for (const value of ['None known', 'none known', ' None known ', 'None']) {
      const result = input([controversy(value)]);
      expect(result.knockOut).toBeNull();
      expect(result.warnings).toEqual([]);
    }
  });

  it('never excludes because of an unverified rating finding', () => {
    expect(input([{ ...risk('High', false), status: 'not_verified' }]).knockOut).toBeNull();
  });

  it('never excludes because of a compliance finding from another document type', () => {
    expect(input([fine({ sourceDocumentType: 'offer' })]).knockOut).toBeNull();
  });
});

describe('values', () => {
  it('uses only verified values', () => {
    const result = input([ev({ value: 0.8 }), price({ status: 'not_verified' })]);
    expect(result.values).toEqual({ quality: 0.8, price: null, co2: null, delivery: null });
    expect(result.warnings).toContain('Price: evidence not verified');
  });
});

describe('warnings', () => {
  it('flags a price at or above the age limit, from the date of the source document', () => {
    expect(input([price({ sourceDate: '2026-06-15' })]).warnings).toContain('Price outdated: 143 days old (15 Jun 2026)');
    expect(input([price({ sourceDate: '2026-08-07' })]).warnings[0]).toContain('90 days old');
    expect(input([price({ sourceDate: '2026-08-08' })]).warnings).toEqual([]);
  });

  it('flags an estimated CO2 value only when the Scope 3 rule asks for it, and never touches the value', () => {
    const co2 = ev({ topic: 'co2', value: 11.2, unit: 'kg', system: 'pcf', recordId: 'PCF-S-1', location: { kind: 'field', field: 'pcfKgPerPiece' }, sourceDate: '2026-09-01', sourceBadge: 'Company estimate' });
    expect(input([co2]).warnings).toEqual([]);
    const flagged = buildDecisionInput(run([co2]), { ...options, flagEstimatedCo2: true })[0]!;
    expect(flagged.warnings).toEqual(['CO₂ value estimated, not supplier-specific (rule of the sustainability manager)']);
    expect(flagged.values.co2).toBe(11.2);
    const actual = buildDecisionInput(run([{ ...co2, sourceBadge: 'Supplier-specific' }]), { ...options, flagEstimatedCo2: true })[0]!;
    expect(actual.warnings).toEqual([]);
  });

  it('flags an indicative price', () => {
    const indicative = price({ location: { kind: 'document', page: 1, quote: 'Unit price: EUR 15.30 per piece (indicative, not binding)' } });
    expect(input([indicative]).warnings).toContain('Indicative price only, not binding');
  });

  it('warns about a late or unverified lead time only when a date is set', () => {
    const lead = ev({ topic: 'leadTime', value: 34, unit: 'days', system: 'documents', recordId: 'DOC-OFFER-S-1', location: { kind: 'document', page: 1, quote: 'Lead time: 34 days' } });
    expect(input([lead], '2026-11-20').warnings).toEqual(['Lead time 34 days, too late for 20 Nov 2026']);
    expect(input([lead], '2026-12-20').warnings).toEqual([]);
    expect(input([], '2026-12-20').warnings).toEqual(['Lead time not verified']);
    expect(input([], null).warnings).toEqual([]);
  });

  it('flags CO2 data at or above the age limit, from the date of the source record', () => {
    const co2 = (sourceDate: string) =>
      ev({ topic: 'co2', value: 7.9, unit: 'kg CO2e/piece', system: 'pcf', recordId: 'PCF-S-1', location: { kind: 'field', field: 'pcfKgPerPiece' }, sourceDate });
    expect(input([co2('2022-04-28')]).warnings).toEqual(['CO₂ data outdated: 4.5 years old (28 Apr 2022)']);
    expect(input([co2('2025-11-05')]).warnings[0]).toContain('outdated');
    expect(input([co2('2025-11-06')]).warnings).toEqual([]);
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-11-01', '2026-11-05')).toBe(4);
  });
});
