import { describe, expect, it } from 'vitest';
import { previousQuarter, purchaseStats, quarterOf } from './purchase-stats.js';
import type { PurchaseOrderRecord } from './sources.js';

function po(change: Partial<PurchaseOrderRecord>): PurchaseOrderRecord {
  return {
    recordId: 'PO-1', system: 'erp', supplierId: 'A', notice: 'Demo data, fictitious',
    provenance: { file: 'x', sheet: 'x', row: 1, assumedFields: [] },
    poNumber: 'PO-1', orderDate: '2026-04-08', partId: 'P', partName: 'Part', quantity: 1000, unitPriceEur: 10,
    pcfKgPerPiece: 20, pcfBadge: 'Supplier-specific', pcfRecordId: 'PCF-A-P',
    cockpitDecisionId: null, replacedSupplierId: null, replacedPcfKgPerPiece: null, replacedUnitPriceEur: null,
    ...change,
  };
}

describe('quarters', () => {
  it('maps dates to quarters and steps back over a year end', () => {
    expect(quarterOf('2026-08-06')).toBe('2026-Q3');
    expect(quarterOf('2026-12-31')).toBe('2026-Q4');
    expect(previousQuarter('2026-Q3')).toBe('2026-Q2');
    expect(previousQuarter('2026-Q1')).toBe('2025-Q4');
  });
});

describe('purchaseStats', () => {
  const orders = [
    po({ orderDate: '2026-05-07', pcfKgPerPiece: 20, pcfBadge: 'Company estimate' }), // Q2: 20 t, spend 10,000
    po({ orderDate: '2026-05-07', partId: 'Q', pcfKgPerPiece: 5 }), // Q2: 5 t, spend 10,000
    // Q3: switched with the cockpit from 20 to 12 kg per piece, a bit dearer
    po({ orderDate: '2026-08-06', pcfKgPerPiece: 12, unitPriceEur: 11, cockpitDecisionId: 'D1', replacedSupplierId: 'B', replacedPcfKgPerPiece: 20 }),
    po({ orderDate: '2026-09-08', pcfKgPerPiece: 12, unitPriceEur: 11, cockpitDecisionId: 'D1', replacedSupplierId: 'B', replacedPcfKgPerPiece: 20 }),
  ];

  it('compares the latest quarter with the one before', () => {
    const stats = purchaseStats(orders)!;
    expect(stats.previous).toMatchObject({ quarter: '2026-Q2', orders: 2, spendEur: 20000, co2Tonnes: 25, actualPcfSharePercent: 50 });
    expect(stats.current).toMatchObject({ quarter: '2026-Q3', orders: 2, spendEur: 22000, co2Tonnes: 24, actualPcfSharePercent: 100 });
    expect(stats.co2ChangePercent).toBe(-4);
    expect(stats.spendChangePercent).toBe(10);
  });

  it('counts avoided CO2e and decisions only for cockpit decisions, each decision once', () => {
    const stats = purchaseStats([...orders, po({ orderDate: '2026-09-09', partId: 'Q', pcfKgPerPiece: 5 })])!;
    expect(stats.avoidedTonnes).toBe(16); // (20 - 12) kg x 1,000 pcs x 2 orders
    expect(stats.cockpitDecisions).toBe(1);
  });

  it('sums CO2e per month and part', () => {
    expect(purchaseStats(orders)!.monthly).toEqual([
      { month: '2026-05', byPart: { P: 20, Q: 5 } },
      { month: '2026-08', byPart: { P: 12 } },
      { month: '2026-09', byPart: { P: 12 } },
    ]);
  });

  it('gives no change without a previous quarter, and nothing without orders', () => {
    expect(purchaseStats([po({ orderDate: '2026-08-06' })])!.co2ChangePercent).toBeNull();
    expect(purchaseStats([])).toBeNull();
  });
});
