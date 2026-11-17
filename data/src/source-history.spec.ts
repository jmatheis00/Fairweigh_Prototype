import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { joinDataset } from '@scc/shared';
import { split } from './source-history.ts';

const SOURCES = fileURLToPath(new URL('../sources/', import.meta.url));
const dataset = joinDataset((path) => JSON.parse(readFileSync(SOURCES + path, 'utf8')) as unknown);

describe('history around the Excel values (client ERP, rating partner, risk monitoring)', () => {
  it('splits a total exactly', () => {
    expect(split(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(split(1000, [1, 2, 3, 4]).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("reproduces the ERP's KPIs exactly from the last 12 months of deliveries", () => {
    for (const e of dataset.erp.filter((x) => x.onTimeDeliveryPercent !== null && x.complaintRatePercent !== null)) {
      const last = dataset.supplierPerformance.filter((p) => p.supplierId === e.supplierId).slice(-12);
      const deliveries = last.reduce((a, p) => a + p.deliveries, 0);
      expect(last, e.supplierId).toHaveLength(12);
      expect((100 * last.reduce((a, p) => a + p.onTimeDeliveries, 0)) / deliveries, e.supplierId).toBeCloseTo(e.onTimeDeliveryPercent!, 6);
      expect((100 * last.reduce((a, p) => a + p.qualityNotifications, 0)) / deliveries, e.supplierId).toBeCloseTo(e.complaintRatePercent!, 6);
      if (e.relationshipStatus === 'Active contract' && e.annualSpendEur !== null) {
        expect(last.reduce((a, p) => a + p.spendEur, 0), e.supplierId).toBe(e.annualSpendEur);
      }
    }
  });

  it('keeps the current rating score and only the certificates the Excel lists', () => {
    for (const r of dataset.ratings.filter((x) => x.sustainabilityScore !== null)) {
      expect(dataset.ratingHistory.filter((h) => h.supplierId === r.supplierId).at(-1)?.score, r.supplierId).toBe(r.sustainabilityScore);
      const listed = (r.certifications ?? '').split(/;\s*/).filter(Boolean).sort();
      expect(dataset.certificates.filter((c) => c.supplierId === r.supplierId).map((c) => c.standard).sort(), r.supplierId).toEqual(listed);
    }
  });

  it('raises alerts only from facts in the other systems', () => {
    for (const a of dataset.riskAlerts) {
      const rating = dataset.ratings.find((r) => r.supplierId === a.supplierId)!;
      if (a.category === 'Controversy' || a.category === 'Human rights') expect(a.detail).toBe(rating.controversies);
      if (a.category === 'Country risk') expect(rating.lksgCountryRisk).toBe('High');
      if (a.category === 'Legal violation') expect(dataset.documents.some((d) => d.supplierId === a.supplierId && d.documentType === 'fine_notice')).toBe(true);
    }
    expect(dataset.riskAlerts.some((a) => a.category === 'Legal violation' && a.supplierId === 'S-0005')).toBe(true);
  });

  it('gives an LkSG country risk High alert the severity High, like the risk tag everywhere else (16 Nov 2026)', () => {
    const country = dataset.riskAlerts.filter((a) => a.category === 'Country risk');
    expect(country.length).toBeGreaterThan(0);
    expect(country.every((a) => a.severity === 'High')).toBe(true);
  });
});
