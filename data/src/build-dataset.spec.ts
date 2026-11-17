import { describe, expect, it } from 'vitest';
import type { Assumptions, PartAssumptions } from './assumptions.ts';
import { buildDataset, estimatePcf, unitPriceFromIndex, type SupplierRow } from './build-dataset.ts';

const part: PartAssumptions = {
  partId: 'P-1',
  partName: 'Housing',
  category: 'Aluminium & Die Casting',
  quantity: 10000,
  currentSupplierId: 'S-0013',
  basePriceEurAtIndex100: { value: 18, toConfirm: true, reason: 'test' },
  pcfEstimate: { referenceKgPerPiece: 8, toConfirm: true, reason: 'test' },
  offers: { 'S-0013': { priceDate: '2026-10-12', validUntil: '2027-01-31', priceType: 'firm', toConfirm: true } },
  pcf: {
    'S-0013': { pcfKgPerPiece: 7.4, badge: 'actual', method: 'test', toConfirm: true },
  },
};

const assumptions: Assumptions = {
  notice: 'test',
  demoSupplierIds: ['S-0013'],
  parts: [part],
  catalog: [
    { partId: 'P-1', partName: 'Housing', category: 'Aluminium & Die Casting', hasOffers: true },
    { partId: 'P-2', partName: 'Bearing', category: 'Bearings', hasOffers: false },
  ],
  co2PricePerTonneEur: { value: 75, toConfirm: true, reason: 'test' },
  extraSuppliers: { toConfirm: true, reason: 'test', rows: [] },
  overrides: {},
  priceMaxAgeDays: { value: 90, toConfirm: true, reason: 'test' },
  co2MaxAgeDays: { value: 365, toConfirm: true, reason: 'test' },
  fineNotices: {},
};

function row(overrides: Record<string, unknown> = {}): SupplierRow {
  return {
    row: 15,
    values: {
      supplier_id: 'S-0013',
      supplier_name: 'Alucast Schwaben GmbH',
      country: 'Germany',
      city: 'Ulm',
      category: 'Aluminium & Die Casting',
      products: 'Die-cast motor housings',
      relationship_status: 'Active contract',
      contract_start: new Date(Date.UTC(2023, 2, 5)),
      contract_end: new Date(Date.UTC(2027, 11, 31)),
      annual_spend_eur: 557000,
      price_index: 102,
      lead_time_days: 4,
      on_time_delivery_pct: 0.89,
      defect_rate_pct: 0.008,
      ecovadis_score: 49,
      certifications: 'ISO 9001',
      sbti_target: 'No',
      lksg_country_risk: 'Low',
      controversies: 'None known',
      last_updated: new Date(Date.UTC(2025, 0, 16)),
      ...overrides,
    },
  };
}

describe('buildDataset', () => {
  it('writes ERP and rating records for every supplier, offers only for demo suppliers', () => {
    const other = row({ supplier_id: 'S-0050', supplier_name: 'Other GmbH', data_source: 'Supplier self-assessment', sustainability_report: 'No' });
    const dataset = buildDataset([row(), other], assumptions);
    expect(dataset.erp.map((e) => e.supplierId)).toEqual(['S-0013', 'S-0050']);
    expect(dataset.ratings.find((r) => r.supplierId === 'S-0050')).toMatchObject({
      co2DataSource: 'Supplier self-assessment',
      sustainabilityReport: false,
    });
    expect(dataset.offers.map((o) => o.supplierId)).toEqual(['S-0013']);
    expect(dataset.pcf.map((p) => p.supplierId)).toEqual(['S-0013']);
  });

  it('builds offers, PCF and documents per part, with the part in every ID', () => {
    const second: PartAssumptions = {
      ...part,
      partId: 'P-2',
      partName: 'Bearing',
      quantity: 500,
      basePriceEurAtIndex100: { value: 10, toConfirm: true, reason: 'test' },
      pcf: { 'S-0013': { pcfKgPerPiece: 1.2, badge: 'actual', method: 'test', toConfirm: true } },
    };
    const dataset = buildDataset([row()], { ...assumptions, parts: [part, second] });
    expect(dataset.offers.map((o) => [o.partId, o.unitPriceEur, o.sourceDocumentId])).toEqual([
      ['P-1', 18.36, 'DOC-OFFER-S-0013-P-1'],
      ['P-2', 10.2, 'DOC-OFFER-S-0013-P-2'],
    ]);
    expect(dataset.pcf.map((p) => p.recordId)).toEqual(['PCF-S-0013-P-1', 'PCF-S-0013-P-2']);
    expect(dataset.documents.filter((d) => d.documentType === 'offer').map((d) => d.file)).toEqual([
      'supplier-documents/quotations/DOC-OFFER-S-0013-P-1.pdf',
      'supplier-documents/quotations/DOC-OFFER-S-0013-P-2.pdf',
    ]);
    // Supporting PDFs real systems hold: scorecard at the rating partner, PCF data sheets from the supplier.
    expect(dataset.documents.filter((d) => d.documentType !== 'offer').map((d) => [d.documentType, d.heldBy, d.file])).toEqual([
      ['rating_scorecard', 'ratings', 'partner-ratings/scorecards/DOC-SCORECARD-S-0013.pdf'],
      ['certificate', 'documents', 'supplier-documents/certificates/DOC-CERT-S-0013-ISO9001.pdf'],
      ['pcf_datasheet', 'documents', 'supplier-documents/pcf-datasheets/DOC-PCF-S-0013-P-1.pdf'],
      ['pcf_datasheet', 'documents', 'supplier-documents/pcf-datasheets/DOC-PCF-S-0013-P-2.pdf'],
    ]);
    expect(dataset.ratings[0]!.scorecardDocumentId).toBe('DOC-SCORECARD-S-0013');
    expect(dataset.pcf.map((p) => p.datasheetDocumentId)).toEqual(['DOC-PCF-S-0013-P-1', 'DOC-PCF-S-0013-P-2']);
    expect(dataset.settings.catalog.find((c) => c.partId === 'P-2')).toMatchObject({
      hasOffers: true,
      defaultQuantity: 500,
      currentSupplierId: 'S-0013',
    });
  });

  it('refuses a current supplier without an offer', () => {
    expect(() => buildDataset([row()], { ...assumptions, parts: [{ ...part, currentSupplierId: 'S-0999' }] })).toThrow(
      'current supplier S-0999 needs an offer',
    );
  });

  it('applies date overrides as dates and marks them as assumed', () => {
    const withOverride = {
      ...assumptions,
      overrides: { 'S-0013': { values: { last_updated: '2025-11-27' }, reason: 'test' } },
    };
    const [rating] = buildDataset([row()], withOverride).ratings;
    expect(rating?.lastUpdated).toBe('2025-11-27');
    expect(rating?.provenance.assumedFields).toContain('last_updated');
  });

  it('converts shares to percent and dates to ISO dates', () => {
    const [erp] = buildDataset([row()], assumptions).erp;
    expect(erp).toMatchObject({
      recordId: 'ERP-S-0013',
      onTimeDeliveryPercent: 89,
      complaintRatePercent: 0.8,
      contractStart: '2023-03-05',
      lastQuoteDate: null,
      provenance: { sheet: 'Suppliers', row: 15, assumedFields: [] },
    });
  });

  it('lists the fields that come from the assumptions, not from the Excel', () => {
    const dataset = buildDataset([row()], assumptions);
    expect(dataset.pcf[0]?.provenance.assumedFields).toContain('pcfKgPerPiece');
    expect(dataset.offers[0]?.provenance.assumedFields).toContain('unitPriceEur');
    expect(dataset.ratings[0]?.provenance.assumedFields).toEqual([]);
  });

  it('marks every record and offer as fictitious', () => {
    const dataset = buildDataset([row()], assumptions);
    const all = [
      ...dataset.erp,
      ...dataset.ratings,
      ...dataset.pcf,
      ...dataset.offers,
      ...dataset.documents,
    ];
    // ERP, rating, PCF, offer, offer PDF, scorecard PDF, certificate PDF and PCF data sheet PDF.
    expect(all).toHaveLength(8);
    for (const item of all) expect(item.notice).toBe('Demo data, fictitious');
  });

  it('derives the unit price from the price index', () => {
    const [offer] = buildDataset([row()], assumptions).offers;
    expect(offer?.unitPriceEur).toBe(18.36);
    expect(offer?.sourceDocumentId).toBe('DOC-OFFER-S-0013-P-1');
  });

  it('takes the PCF reference date from the Excel', () => {
    const [pcf] = buildDataset([row()], assumptions).pcf;
    expect(pcf).toMatchObject({ pcfKgPerPiece: 7.4, badge: 'Supplier-specific', referenceDate: '2025-01-16' });
  });

  it('keeps missing values as null instead of inventing them', () => {
    const [erp] = buildDataset(
      [row({ on_time_delivery_pct: null, defect_rate_pct: '' })],
      assumptions,
    ).erp;
    expect(erp?.onTimeDeliveryPercent).toBeNull();
    expect(erp?.complaintRatePercent).toBeNull();
  });

  it('fails if a demo supplier is missing or duplicated', () => {
    expect(() => buildDataset([], assumptions)).toThrow('found 0');
    expect(() => buildDataset([row(), row()], assumptions)).toThrow('found 2');
  });

  it('fails on values it cannot interpret', () => {
    expect(() => buildDataset([row({ on_time_delivery_pct: 89 })], assumptions)).toThrow('fraction');
    expect(() => buildDataset([row({ sbti_target: 'Maybe' })], assumptions)).toThrow('Yes or No');
    expect(() => buildDataset([row({ lksg_country_risk: 'Severe' })], assumptions)).toThrow('unknown');
  });
});

describe('settings', () => {
  it('passes the product list and the CO2 price placeholder to the cockpit', () => {
    const { settings } = buildDataset([row()], assumptions);
    expect(settings.catalog.map((p) => p.hasOffers)).toEqual([true, false]);
    expect(settings).toMatchObject({ defaultQuantity: 10000, co2PricePerTonneEur: 75, co2PriceToConfirm: true });
  });

  it('fails if a part with offers is missing from the catalog', () => {
    expect(() => buildDataset([row()], { ...assumptions, catalog: [assumptions.catalog[1]!] })).toThrow(
      'P-1 must be in the catalog',
    );
  });

  it('makes a part selectable because it has offers, not because of a flag', () => {
    const settings = buildDataset([row()], { ...assumptions, catalog: [{ ...assumptions.catalog[0]!, hasOffers: false }] }).settings;
    expect(settings.catalog[0]?.hasOffers).toBe(true);
  });
});

describe('unitPriceFromIndex', () => {
  it('rounds to cents', () => {
    expect(unitPriceFromIndex(18, 102)).toBe(18.36);
    expect(unitPriceFromIndex(17.99, 76)).toBe(13.67);
  });
});

describe('offer document', () => {
  it('states the offer values in the PDF text, so they can be checked later', () => {
    const [document] = buildDataset([row()], assumptions).documents;
    expect(document).toMatchObject({ documentId: 'DOC-OFFER-S-0013-P-1', supplierId: 'S-0013' });
    const lines = document!.pages[0]!.lines;
    // The supplier's name is the letterhead; only a small sample line at the bottom (decision of 8 Nov 2026).
    expect(lines[0]).toBe('Alucast Schwaben GmbH');
    expect(lines.at(-1)).toBe('Sample document from the Fairweigh prototype.');
    expect(lines).toContain('Unit price: EUR 18.36 per piece');
    expect(lines).toContain('Quantity: 10,000 pcs');
    expect(lines).toContain('Total: EUR 183,600.00');
    expect(lines).toContain('Supplier ID: S-0013');
  });
});

describe('more demo suppliers', () => {
  const other = (id: string, overrides: Record<string, unknown> = {}) =>
    row({ supplier_id: id, supplier_name: `Supplier ${id}`, co2_intensity_kg_per_eur: 2.0, ...overrides });

  const extended: Assumptions = {
    ...assumptions,
    demoSupplierIds: ['S-0013', 'S-0005', 'S-0101'],
    extraSuppliers: {
      toConfirm: true,
      reason: 'test',
      rows: [
        {
          supplier_id: 'S-0101', supplier_name: 'New GmbH', country: 'Germany', city: 'Kempten',
          category: 'Aluminium & Die Casting', products: 'Housings', relationship_status: 'Quote only',
          price_index: 115, lead_time_days: 21, on_time_delivery_pct: 0.94, defect_rate_pct: 0.006,
          co2_intensity_kg_per_eur: 0.7, lksg_country_risk: 'Low', sbti_target: 'Yes', last_updated: '2026-09-15',
        },
      ],
    },
    overrides: { 'S-0005': { values: { products: 'Die-cast housings' }, reason: 'test' } },
    parts: [
      {
        ...part,
        offers: {
          ...part.offers,
          'S-0005': { priceDate: '2026-09-30', validUntil: '2026-12-31', priceType: 'indicative', toConfirm: true },
        },
        pcf: { ...part.pcf, 'S-0005': { badge: 'estimated', toConfirm: true } },
      },
    ],
    fineNotices: {
      'S-0005': { issuedOn: '2024-06-12', authority: 'Authority (fictitious)', decision: 'Fine for wastewater', status: 'Final and binding', toConfirm: true, reason: 'test' },
    },
  };
  // Category average over the Excel rows: (1.744 + 2.0) / 2 = 1.872
  const rows = [row({ co2_intensity_kg_per_eur: 1.744 }), other('S-0005')];

  it('adds new fictitious suppliers and marks where they come from', () => {
    const erp = buildDataset(rows, extended).erp.find((e) => e.supplierId === 'S-0101');
    expect(erp).toMatchObject({ supplierName: 'New GmbH', onTimeDeliveryPercent: 94, provenance: { file: 'data/assumptions.json' } });
  });

  it('applies overrides and lists them as assumed', () => {
    const erp = buildDataset(rows, extended).erp.find((e) => e.supplierId === 'S-0005');
    expect(erp?.products).toBe('Die-cast housings');
    expect(erp?.provenance.assumedFields).toEqual(['products']);
  });

  it('estimates the PCF from the CO2 intensity and the category average', () => {
    const pcf = buildDataset(rows, extended).pcf.find((p) => p.supplierId === 'S-0005');
    expect(pcf).toMatchObject({ badge: 'Company estimate', pcfKgPerPiece: estimatePcf(8, 2.0, 1.872) });
    expect(pcf?.pcfKgPerPiece).toBe(8.5);
    expect(pcf?.method).toContain('Estimate');
  });

  it('writes indicative prices as not binding', () => {
    const doc = buildDataset(rows, extended).documents.find((d) => d.documentId === 'DOC-OFFER-S-0005-P-1');
    expect(doc?.pages[0]?.lines).toContain('Unit price: EUR 18.36 per piece (indicative, not binding)');
  });

  it('creates the fine notice as a document of type fine_notice', () => {
    const fine = buildDataset(rows, extended).documents.find((d) => d.documentId === 'DOC-FINE-S-0005');
    expect(fine).toMatchObject({ documentType: 'fine_notice', supplierId: 'S-0005', issuedOn: '2024-06-12' });
    expect(fine?.pages[0]?.lines).toContain('Decision: Fine for wastewater');
    expect(fine?.pages[0]?.lines).toContain('Status: Final and binding');
  });
});
