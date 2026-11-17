import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { joinDataset, splitDataset, type DemoDataset, type Evidence } from '@scc/shared';
import { JsonFileDemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { checkEvidence, normaliseUnit, numbersIn } from './evidence-check.js';

/**
 * Mandatory tests (CLAUDE.md): every rule of the evidence check.
 * Based on the real demo data for S-0013, plus a few test-only records.
 */
const SOURCES = resolve(process.cwd(), '../data/sources');
const realDataset = joinDataset((path) => JSON.parse(readFileSync(join(SOURCES, path), 'utf8')) as unknown);

function repositoryWith(change: (d: DemoDataset) => void = () => {}) {
  const dataset = structuredClone(realDataset);
  change(dataset);
  const dir = mkdtempSync(join(tmpdir(), 'scc-check-'));
  for (const [path, content] of Object.entries(splitDataset(dataset))) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(content));
  }
  return new JsonFileDemoDataRepository(dir);
}

const data = repositoryWith();
const request = { partId: 'P-ALU-HSG-01', supplierIds: ['S-0013'], quantity: 10000, neededBy: null };
const AT = '2026-11-04T10:00:00.000Z';

let counter = 0;
function ev(overrides: Partial<Evidence>): Evidence {
  counter += 1;
  return {
    evidenceId: `e${counter}`,
    supplierId: 'S-0013',
    topic: 'quality',
    value: 0.8,
    unit: '%',
    sentence: 'test',
    system: 'erp',
    recordId: 'ERP-S-0013',
    location: { kind: 'field', field: 'complaintRatePercent' },
    retrievedAt: AT,
    status: 'unchecked',
    checkFailures: [],
    sourceDocumentType: null,
    sourceDate: null,
    sourceBadge: null,
    ...overrides,
  };
}

const quality = () => ev({});
const delivery = () => ev({ topic: 'delivery', value: 95, location: { kind: 'field', field: 'onTimeDeliveryPercent' } });
const co2 = () =>
  ev({
    topic: 'co2', value: 38, unit: 'kg CO2e/piece', system: 'pcf',
    recordId: 'PCF-S-0013-P-ALU-HSG-01', location: { kind: 'field', field: 'pcfKgPerPiece' },
  });
const price = () =>
  ev({
    topic: 'price', value: 84.5, unit: 'EUR/piece', system: 'documents', recordId: 'DOC-OFFER-S-0013-P-ALU-HSG-01',
    location: { kind: 'document', page: 1, quote: 'Unit price: EUR 84.50 per piece' },
  });

const leadTime = () =>
  ev({
    topic: 'leadTime', value: 24, unit: 'days', system: 'documents', recordId: 'DOC-OFFER-S-0013-P-ALU-HSG-01',
    location: { kind: 'document', page: 1, quote: 'Lead time: 24 days' },
  });

/** Checks one piece of evidence and returns its result. */
function check(e: Evidence, repo = data, req = request): Evidence {
  const [result] = checkEvidence([e], repo, req);
  if (!result) throw new Error('no result');
  return result;
}

function expectRejected(e: Evidence, reason: string, repo = data, req = request) {
  const result = check(e, repo, req);
  expect(result.status).toBe('not_verified');
  expect(result.checkFailures.join('; ')).toContain(reason);
}

describe('evidence check: correct evidence passes', () => {
  it('verifies all four criteria and the lead time for S-0013', () => {
    const results = checkEvidence([quality(), delivery(), co2(), price(), leadTime()], data, request);
    for (const r of results) {
      expect(r.checkFailures).toEqual([]);
      expect(r.status).toBe('verified');
    }
  });

  it('accepts the same unit written differently', () => {
    expect(check({ ...price(), unit: 'EUR per piece' }).status).toBe('verified');
    expect(check({ ...price(), unit: '€/pc' }).status).toBe('verified');
    expect(check({ ...co2(), unit: 'kg CO₂e per piece' }).status).toBe('verified');
  });

  it('accepts part of a line as the quote and extra spaces', () => {
    expect(check({ ...price(), location: { kind: 'document', page: 1, quote: 'EUR  84.50 per piece' } }).status).toBe('verified');
  });

  it('does not change the input', () => {
    const input = quality();
    checkEvidence([input], data, request);
    expect(input.status).toBe('unchecked');
  });
});

describe('evidence check: does the source exist?', () => {
  it('rejects a source that does not exist', () => {
    expectRejected({ ...quality(), recordId: 'ERP-S-9999' }, 'does not exist');
  });

  it('rejects a source the agent did not retrieve in this run', () => {
    expectRejected({ ...quality(), retrievedAt: null }, 'not retrieved in this run');
  });

  it('rejects a wrong system for the source', () => {
    expectRejected({ ...quality(), system: 'ratings' }, 'is in system erp');
  });

  it('rejects a criterion from a system that cannot prove it', () => {
    expectRejected(
      ev({ topic: 'price', value: 102, unit: 'EUR/piece', location: { kind: 'field', field: 'priceIndex' } }),
      'cannot be proven from system erp',
    );
  });
});

describe('evidence check: is the value at the stated location?', () => {
  it('rejects a value that differs from the record', () => {
    expectRejected({ ...quality(), value: 0.5 }, 'differs from the source');
  });

  it('rejects a field that does not hold this criterion', () => {
    expectRejected({ ...quality(), value: 89, location: { kind: 'field', field: 'onTimeDeliveryPercent' } }, 'expected complaintRatePercent');
  });

  it('rejects an empty field, so a gap never counts as a value', () => {
    const repo = repositoryWith((d) => {
      d.erp.find((r) => r.supplierId === 'S-0013')!.complaintRatePercent = null;
    });
    expectRejected(quality(), 'is empty', repo);
  });

  it('rejects a quote that is not on the page', () => {
    expectRejected({ ...price(), location: { kind: 'document', page: 1, quote: 'Unit price: EUR 15.00 per piece' } }, 'quote not found');
  });

  it('rejects a page that does not exist', () => {
    expectRejected({ ...price(), location: { kind: 'document', page: 2, quote: 'Unit price: EUR 84.50 per piece' } }, 'page 2 does not exist');
  });

  it('rejects a value that is not in the quote', () => {
    expectRejected({ ...price(), value: 17.5 }, 'not in the quote');
  });

  it('rejects an empty quote', () => {
    expectRejected({ ...price(), location: { kind: 'document', page: 1, quote: '  ' } }, 'quote not found');
  });

  it('rejects a field for a document and a quote for a record', () => {
    expectRejected({ ...price(), location: { kind: 'field', field: 'title' } }, 'needs a page and a quote');
    expectRejected({ ...quality(), location: { kind: 'document', page: 1, quote: '0.8' } }, 'needs a field');
  });
});

describe('evidence check: do unit and supplier match?', () => {
  it('rejects a wrong unit', () => {
    expectRejected({ ...price(), unit: 'EUR' }, 'unit "EUR"');
    expectRejected({ ...co2(), unit: 't CO2e' }, 'does not match');
  });

  it('rejects a source of another supplier', () => {
    expectRejected({ ...quality(), supplierId: 'S-0014' }, 'belongs to S-0013', data, {
      ...request,
      supplierIds: ['S-0013', 'S-0014'],
    });
  });

  it('rejects a PCF or an offer for another part', () => {
    const other = { ...request, partId: 'P-OTHER' };
    expectRejected(co2(), 'PCF is for part P-ALU-HSG-01', data, other);
    expectRejected(price(), 'offer is for part P-ALU-HSG-01', data, other);
  });

  it('rejects a price or lead time from a document that is not an offer of the supplier', () => {
    const repo = repositoryWith((d) => {
      d.offers = [];
    });
    expectRejected(price(), 'is not an offer of S-0013', repo);
    expectRejected(leadTime(), 'is not an offer of S-0013', repo);
  });

  it('rejects a lead time with a wrong unit or value', () => {
    expectRejected({ ...leadTime(), unit: 'weeks' }, 'unit "weeks"');
    expectRejected({ ...leadTime(), value: 3 }, 'not in the quote');
    expect(check({ ...leadTime(), unit: 'day' }).status).toBe('verified');
  });
});

describe('evidence check: contradictions and compliance', () => {
  it('rejects both pieces when two sources state different values', () => {
    const repo = repositoryWith((d) => {
      const doc = structuredClone(d.documents.find((x) => x.documentId === 'DOC-OFFER-S-0013-P-ALU-HSG-01')!);
      doc.recordId = doc.documentId = 'DOC-OFFER-S-0013-B';
      doc.pages[0]!.lines = ['Unit price: EUR 17.00 per piece'];
      d.documents.push(doc);
      d.offers.push({ ...structuredClone(d.offers.find((o) => o.supplierId === 'S-0013')!), sourceDocumentId: 'DOC-OFFER-S-0013-B', unitPriceEur: 17 });
    });
    const second = {
      ...price(), value: 17, recordId: 'DOC-OFFER-S-0013-B',
      location: { kind: 'document' as const, page: 1, quote: 'Unit price: EUR 17.00 per piece' },
    };
    const results = checkEvidence([price(), second], repo, request);
    expect(results.map((r) => r.status)).toEqual(['not_verified', 'not_verified']);
    expect(results[0]?.checkFailures[0]).toContain('contradicting evidence: 84.5 vs. 17');
  });

  it('verifies a controversy from the rating, but not from another field', () => {
    const repo = repositoryWith((d) => {
      d.ratings.find((r) => r.supplierId === 'S-0013')!.controversies = '2024: fined for wastewater discharge';
    });
    const finding = ev({
      topic: 'compliance', value: '2024: fined for wastewater discharge', unit: 'text', system: 'ratings',
      recordId: 'RAT-S-0013', location: { kind: 'field', field: 'controversies' },
    });
    expect(check(finding, repo).status).toBe('verified');
    expectRejected({ ...finding, location: { kind: 'field', field: 'certifications' } }, 'cannot prove a compliance finding', repo);
    expectRejected({ ...finding, value: 'fraud' }, 'text differs', repo);
  });
});

describe('evidence check: compliance from real demo data', () => {
  const all = { ...request, supplierIds: ['S-0013', 'S-0014', 'S-0005'] };

  it('verifies a fine notice and records its type and date from the source', () => {
    const fine = ev({
      supplierId: 'S-0005', topic: 'compliance', value: 'Fine of CNY 200,000 for unlawful discharge of untreated wastewater',
      unit: 'text', system: 'documents', recordId: 'DOC-FINE-S-0005',
      location: { kind: 'document', page: 1, quote: 'Decision: Fine of CNY 200,000 for unlawful discharge of untreated wastewater' },
    });
    expect(check(fine, data, all)).toMatchObject({ status: 'verified', sourceDocumentType: 'fine_notice', sourceDate: '2024-06-12' });
  });

  it('ignores a document type or date the agent claims', () => {
    const claimed = { ...price(), sourceDocumentType: 'fine_notice' as const, sourceDate: '2099-01-01' };
    expect(check(claimed)).toMatchObject({ sourceDocumentType: 'offer', sourceDate: '2026-11-03' });
    // The ERP record's last update is the "as of" date of its values (S-0013: 4 Feb 2026 in Excel v2).
    expect(check(quality())).toMatchObject({ sourceDocumentType: null, sourceDate: '2026-02-04', sourceBadge: null });
    expect(check(co2())).toMatchObject({ sourceBadge: 'Supplier-specific', sourceDate: '2025-12-31' });
  });

  it('verifies a high LkSG country risk from the rating', () => {
    const risk = ev({
      supplierId: 'S-0014', topic: 'compliance', value: 'High', unit: 'text', system: 'ratings',
      recordId: 'RAT-S-0014', location: { kind: 'field', field: 'lksgCountryRisk' },
    });
    expect(check(risk, data, all).status).toBe('verified');
    expectRejected({ ...risk, supplierId: 'S-0013', recordId: 'RAT-S-0013' }, 'text differs', data, all);
  });
});

describe('helpers', () => {
  it('normaliseUnit', () => {
    expect(normaliseUnit('EUR per piece')).toBe('eur/piece');
    expect(normaliseUnit('kg CO₂e / pcs')).toBe('kgco2e/piece');
    expect(normaliseUnit('percent')).toBe('%');
  });

  it('numbersIn', () => {
    expect(numbersIn('Total: EUR 183,600.00 for 10,000 pcs')).toEqual([183600, 10000]);
    expect(numbersIn('no numbers')).toEqual([]);
  });
});
