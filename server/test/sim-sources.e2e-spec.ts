import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { impactStats, purchaseStats, type DecisionRecord, type DemoSettings, type PurchaseOrderRecord } from '@scc/shared';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

/** Runs against the committed source folders in data/sources/. */
describe('Simulated source systems (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the ERP record of S-0013 with quality and delivery values', async () => {
    const res = await request(app.getHttpServer()).get('/api/sim/erp/suppliers/S-0013').expect(200);
    expect(res.body).toMatchObject({
      recordId: 'ERP-S-0013',
      supplierName: 'Alucast Schwaben GmbH',
      onTimeDeliveryPercent: 95,
      complaintRatePercent: 0.8,
      notice: 'Demo data, fictitious',
    });
  });

  it('lists all 100 suppliers and their ratings for the suppliers page', async () => {
    const erp = await request(app.getHttpServer()).get('/api/sim/erp/suppliers').expect(200);
    const ratings = await request(app.getHttpServer()).get('/api/sim/ratings/suppliers').expect(200);
    expect(erp.body).toHaveLength(100);
    expect(ratings.body).toHaveLength(100);
    expect(erp.body.every((r: { notice: string }) => r.notice === 'Demo data, fictitious')).toBe(true);
    // Corrections from data/assumptions.json: no future date, no supplier-specific CO₂ source without a PCF record.
    const byId = (id: string) => ratings.body.find((r: { supplierId: string }) => r.supplierId === id);
    expect(byId('S-0046').lastUpdated).toBe('2025-11-10');
    expect(byId('S-0013').co2DataSource).toBe('Supplier self-assessment');
  });

  it('serves one open purchase requisition per product plus sample work, earliest first', async () => {
    const res = await request(app.getHttpServer()).get('/api/sim/erp/purchase-requisitions').expect(200);
    const reqs = res.body as { recordId: string; partId: string; quantity: number; neededBy: string; status: string; notice: string }[];
    const open = reqs.filter((r) => r.status === 'open');
    expect(open.map((r) => r.partId).sort()).toEqual(['P-ALU-HSG-01', 'P-BRG-01', 'P-CU-WIRE-01', 'P-SEAL-01', 'P-STL-HSG-01']);
    expect(open[0]).toMatchObject({ recordId: 'PR-10041207', partId: 'P-ALU-HSG-01', quantity: 2000, neededBy: '2026-12-18' });
    // Sample work (16 Nov 2026): one started earlier, two closed by the example decisions of July 2026.
    expect(reqs.filter((r) => r.status === 'in progress').map((r) => r.recordId)).toEqual(['PR-10040986']);
    expect(reqs.filter((r) => r.status === 'closed').map((r) => r.recordId)).toEqual(['PR-10038112', 'PR-10038120']);
    expect(reqs.every((r) => r.notice === 'Demo data, fictitious')).toBe(true);
    expect([...reqs].sort((a, b) => a.neededBy.localeCompare(b.neededBy))).toEqual(reqs);
  });

  it('serves the purchase history; the statistics match a hand calculation', async () => {
    const res = await request(app.getHttpServer()).get('/api/sim/erp/purchase-orders').expect(200);
    const orders = res.body as PurchaseOrderRecord[];
    // January 2025 to September 2026, one order per product and month.
    expect(orders).toHaveLength(63);
    expect(orders.every((o) => o.notice === 'Demo data, fictitious')).toBe(true);
    const stats = purchaseStats(orders)!;
    // Q2: 3 x (700 x 38 + 1,500 x 24.6 + 650 x 16.4) kg = 222.5 t
    // Q3: 3 x (700 x 38 + 1,500 x 13.8 + 650 x 10.9) kg = 163.2 t
    expect(stats.previous.co2Tonnes).toBe(222.5);
    expect(stats.current.co2Tonnes).toBe(163.2);
    expect(stats.co2ChangePercent).toBe(-26.7);
    // 3 x (1,500 x (24.6 - 13.8) + 650 x (16.4 - 10.9)) kg = 59.3 t
    expect(stats.avoidedTonnes).toBe(59.3);
    expect(stats.cockpitDecisions).toBe(2);
    // Impact for the CPO: steel (46.92 − 48.30) × 4,500 = −6,210 EUR, copper (63.24 − 63.86) × 1,950 = −1,209 EUR
    const impact = impactStats(orders, [], 75)!;
    expect(impact.decisions.map((d) => [d.decisionId, d.extraCostEur])).toEqual([
      ['DEC-2026-07-STL', -6210],
      ['DEC-2026-07-CU', -1209],
    ]);
    expect([impact.extraCostEur, impact.avoidedTonnes, impact.costPerTonneEur]).toEqual([-7419, 59.3, -125.1]);
    // Every order points to a PCF record that exists.
    for (const o of orders) await request(app.getHttpServer()).get(`/api/sim/pcf/suppliers/${o.supplierId}/parts/${o.partId}`).expect(200);
  });

  it('serves two example decisions by Thomas, marked as examples, with evidence that exists', async () => {
    const res = await request(app.getHttpServer()).get('/api/sim/example-decisions').expect(200);
    const records = res.body as DecisionRecord[];
    expect(records.map((r) => [r.recordId, r.chosenSupplierId, r.followsRecommendation])).toEqual([
      ['DEC-2026-07-STL', 'S-0007', true],
      ['DEC-2026-07-CU', 'S-0021', true],
    ]);
    expect(records.every((r) => r.mode.kind === 'example' && r.decidedBy?.name === 'Thomas')).toBe(true);
    // The same decision IDs as the purchase orders that followed.
    const orders = (await request(app.getHttpServer()).get('/api/sim/erp/purchase-orders')).body as PurchaseOrderRecord[];
    expect(new Set(orders.map((o) => o.cockpitDecisionId).filter(Boolean))).toEqual(new Set(records.map((r) => r.recordId)));
    for (const e of records.flatMap((r) => r.evidence)) {
      expect(e.status).toBe('verified');
      const path = e.recordId.startsWith('DOC-') ? `documents/${e.recordId}` : e.recordId.startsWith('ERP-') ? `erp/suppliers/${e.recordId.slice(4)}` : null;
      if (path) await request(app.getHttpServer()).get(`/api/sim/${path}`).expect(200);
    }
  });

  it('lists all PCF records and the fine notices for the sustainability page', async () => {
    const pcf = await request(app.getHttpServer()).get('/api/sim/pcf').expect(200);
    expect(pcf.body).toHaveLength(26);
    const fines = await request(app.getHttpServer()).get('/api/sim/documents?type=fine_notice').expect(200);
    expect(fines.body.map((d: { documentId: string }) => d.documentId)).toEqual(['DOC-FINE-S-0005']);
    await request(app.getHttpServer()).get('/api/sim/documents?type=other').expect(404);
  });

  it('returns 404 for an unknown supplier instead of inventing data', async () => {
    await request(app.getHttpServer()).get('/api/sim/erp/suppliers/S-9999').expect(404);
    await request(app.getHttpServer()).get('/api/sim/ratings/suppliers/S-9999').expect(404);
  });

  it('returns the rating and the PCF record', async () => {
    const rating = await request(app.getHttpServer()).get('/api/sim/ratings/suppliers/S-0013').expect(200);
    expect(rating.body).toMatchObject({ lksgCountryRisk: 'Low', sustainabilityScore: 47 });
    const pcf = await request(app.getHttpServer())
      .get('/api/sim/pcf/suppliers/S-0013/parts/P-ALU-HSG-01')
      .expect(200);
    expect(pcf.body).toMatchObject({ pcfKgPerPiece: 38, badge: 'Supplier-specific' });
    await request(app.getHttpServer()).get('/api/sim/pcf/suppliers/S-0013/parts/P-OTHER').expect(404);
  });

  it('lists the documents of a supplier and returns their text', async () => {
    const list = await request(app.getHttpServer()).get('/api/sim/documents?supplierId=S-0013').expect(200);
    const byType = (type: string) => list.body.filter((d: { documentType: string }) => d.documentType === type).map((d: { documentId: string }) => d.documentId);
    expect(byType('offer')).toEqual(['DOC-OFFER-S-0013-P-ALU-HSG-01']);
    // The same supplier in the other systems: data sheet from the supplier, scorecard of the rating partner, order PDFs of the ERP.
    expect(byType('pcf_datasheet')).toEqual(['DOC-PCF-S-0013-P-ALU-HSG-01']);
    expect(byType('rating_scorecard')).toEqual(['DOC-SCORECARD-S-0013']);
    expect(byType('purchase_order')).toHaveLength(21);
    const fine = await request(app.getHttpServer()).get('/api/sim/documents?supplierId=S-0005').expect(200);
    expect(fine.body.map((d: { documentType: string }) => d.documentType)).toEqual(['fine_notice', 'rating_scorecard']);
    const doc = await request(app.getHttpServer()).get('/api/sim/documents/DOC-OFFER-S-0013-P-ALU-HSG-01').expect(200);
    expect(doc.body.pages[0].lines).toContain('Unit price: EUR 84.50 per piece');
  });

  it('serves the offer as a PDF file', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sim/documents/DOC-OFFER-S-0013-P-ALU-HSG-01/file')
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('Content-Type', 'application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('keeps each PDF in the folder of its system and links it from the record', async () => {
    const rating = await request(app.getHttpServer()).get('/api/sim/ratings/suppliers/S-0013').expect(200);
    expect(rating.body.scorecardDocumentId).toBe('DOC-SCORECARD-S-0013');
    const scorecard = await request(app.getHttpServer()).get('/api/sim/documents/DOC-SCORECARD-S-0013').expect(200);
    expect(scorecard.body).toMatchObject({ heldBy: 'ratings', file: 'partner-ratings/scorecards/DOC-SCORECARD-S-0013.pdf' });
    expect(scorecard.body.pages[0].lines).toContain('Overall score: 47 / 100');
    const orders = (await request(app.getHttpServer()).get('/api/sim/erp/purchase-orders')).body as PurchaseOrderRecord[];
    expect(orders.every((o) => o.documentId === `DOC-${o.poNumber}`)).toBe(true);
    const pdf = await request(app.getHttpServer()).get(`/api/sim/documents/${orders[0]!.documentId}/file`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    // Footprints from the PACT exchange have no data sheet; the others link to theirs.
    const pact = await request(app.getHttpServer()).get('/api/sim/pcf/suppliers/S-0015/parts/P-ALU-HSG-01').expect(200);
    expect(pact.body.datasheetDocumentId).toBeNull();
  });

  it('measures every product against today (current supplier) and keeps the real industry CO₂ average as context', async () => {
    const settings = (await request(app.getHttpServer()).get('/api/sim/settings').expect(200)).body as DemoSettings;
    const aluPart = settings.catalog.find((p) => p.partId === 'P-ALU-HSG-01')!;
    const alu = aluPart.benchmarks!;
    // Today = suppliers of the last three purchases (all Alucast Schwaben): ERP complaint rate and on-time delivery, PCF footprint
    expect(alu.quality).toMatchObject({ value: 0.8, short: 'Today', kind: 'internal' });
    expect(alu.delivery).toMatchObject({ value: 95, short: 'Today' });
    expect(alu.co2).toMatchObject({ value: 38, short: 'Today', sourceUrl: null });
    // Price we pay today: average of the last three purchase orders of GH-200 in the client ERP (all Alucast Schwaben, EUR 84.50)
    expect(alu.price).toMatchObject({ value: 84.5, short: 'Price today', kind: 'internal', sourceUrl: null });
    expect(alu.price.basis).toContain('average of the last 3 purchases');
    // Bearings have no purchase orders yet: the current contract and the current supplier are used instead
    expect(settings.catalog.find((p) => p.partId === 'P-BRG-01')!.benchmarks!.quality.basis).toContain('current supplier');
    // Industry average, context only. IAI 2023: 10.04 kg CO₂e per kg aluminium × 3.2 kg per housing = 32.1 kg
    expect(aluPart.industryCo2).toMatchObject({ value: 32.1, kind: 'official', sourceUrl: expect.stringContaining('international-aluminium.org') });
    expect(settings.catalog.find((p) => p.partId === 'P-STL-HSG-01')!.industryCo2!.value).toBe(28.8); // 1.92 × 15 kg
    expect(settings.catalog.find((p) => p.partId === 'P-CU-WIRE-01')!.industryCo2!.value).toBe(17.6); // 3.52 × 5 kg
    expect(settings.catalog.filter((p) => !p.hasOffers).every((p) => p.benchmarks === null && p.industryCo2 === null)).toBe(true);
  });

  it('serves the history around the suppliers: ERP vendor evaluation, rating partner, risk monitoring', async () => {
    const perf = (await request(app.getHttpServer()).get('/api/sim/erp/supplier-performance').expect(200)).body as { supplierId: string; deliveries: number; onTimeDeliveries: number }[];
    const last12 = perf.filter((p) => p.supplierId === 'S-0013').slice(-12);
    // The ERP KPI of S-0013 (95 % on time) is the sum of its last 12 months.
    expect((100 * last12.reduce((a, p) => a + p.onTimeDeliveries, 0)) / last12.reduce((a, p) => a + p.deliveries, 0)).toBeCloseTo(95, 6);
    const history = (await request(app.getHttpServer()).get('/api/sim/ratings/history').expect(200)).body as { supplierId: string; score: number }[];
    expect(history.filter((h) => h.supplierId === 'S-0013').at(-1)?.score).toBe(47);
    await request(app.getHttpServer()).get('/api/sim/ratings/certificates').expect(200);
    await request(app.getHttpServer()).get('/api/sim/ratings/company-emissions').expect(200);
    const alerts = (await request(app.getHttpServer()).get('/api/sim/risk/alerts').expect(200)).body as { supplierId: string; category: string }[];
    expect(alerts.some((a) => a.supplierId === 'S-0005' && a.category === 'Legal violation')).toBe(true);
  });

  it('does not serve files outside the document list', async () => {
    await request(app.getHttpServer()).get('/api/sim/documents/..%2Fdemo-dataset.json/file').expect(404);
  });
});
