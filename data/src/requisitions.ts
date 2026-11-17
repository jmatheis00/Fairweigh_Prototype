import { DEMO_DATA_NOTICE, type DemoDataset, type PurchaseRequisitionRecord } from '@scc/shared';

/**
 * Open purchase requisitions in the client ERP (work queue, decision of 10 Nov 2026).
 * One fictitious requisition per product with offers. Quantity is the product's
 * demo quantity; GH-200 keeps the due date of the Excel v2 demo request.
 */
const REQUISITIONS: Record<string, Omit<PurchaseRequisitionRecord, 'system' | 'notice' | 'partName' | 'category' | 'quantity'> & { neededBy: string }> = {
  'P-ALU-HSG-01': {
    recordId: 'PR-10041207',
    partId: 'P-ALU-HSG-01',
    neededBy: '2026-12-18',
    createdOn: '2026-11-03',
    requestedBy: 'Plant Mannheim, gearbox assembly line 2',
    buyer: 'Thomas',
    status: 'open',
  },
  'P-CU-WIRE-01': {
    recordId: 'PR-10041219',
    partId: 'P-CU-WIRE-01',
    neededBy: '2027-01-08',
    createdOn: '2026-11-04',
    requestedBy: 'Plant Mannheim, motor winding',
    buyer: 'Thomas',
    status: 'open',
  },
  'P-STL-HSG-01': {
    recordId: 'PR-10041224',
    partId: 'P-STL-HSG-01',
    neededBy: '2027-01-22',
    createdOn: '2026-11-05',
    requestedBy: 'Plant Ludwigshafen, heavy gearboxes',
    buyer: 'Thomas',
    status: 'open',
  },
  'P-BRG-01': {
    recordId: 'PR-10041231',
    partId: 'P-BRG-01',
    neededBy: '2027-02-05',
    createdOn: '2026-11-05',
    requestedBy: 'Plant Mannheim, gearbox assembly line 1',
    buyer: 'Thomas',
    status: 'open',
  },
  'P-SEAL-01': {
    recordId: 'PR-10041238',
    partId: 'P-SEAL-01',
    neededBy: '2027-02-19',
    createdOn: '2026-11-06',
    requestedBy: 'Plant Ludwigshafen, heavy gearboxes',
    buyer: 'Thomas',
    status: 'open',
  },
};

/**
 * Sample work around the open requisitions (16 Nov 2026), so "My open requests" and "Completed" show how they
 * look: one requisition whose sourcing started earlier, and two closed ones from July 2026 that belong to the two
 * example decisions in the decision log (same part, quantity and buyer).
 */
const SAMPLE_REQUISITIONS: (Omit<PurchaseRequisitionRecord, 'system' | 'notice' | 'partName' | 'category'>)[] = [
  {
    recordId: 'PR-10040986',
    partId: 'P-BRG-01',
    quantity: 8000,
    neededBy: '2027-01-15',
    createdOn: '2026-10-28',
    requestedBy: 'Plant Ludwigshafen, heavy gearboxes',
    buyer: 'Thomas',
    status: 'in progress',
  },
  {
    recordId: 'PR-10038112',
    partId: 'P-STL-HSG-01',
    quantity: 4500,
    neededBy: '2026-08-28',
    createdOn: '2026-06-24',
    requestedBy: 'Plant Ludwigshafen, heavy gearboxes',
    buyer: 'Thomas',
    status: 'closed',
  },
  {
    recordId: 'PR-10038120',
    partId: 'P-CU-WIRE-01',
    quantity: 1950,
    neededBy: '2026-09-04',
    createdOn: '2026-06-25',
    requestedBy: 'Plant Mannheim, motor winding',
    buyer: 'Thomas',
    status: 'closed',
  },
];

export function purchaseRequisitions(dataset: DemoDataset): PurchaseRequisitionRecord[] {
  const samples = SAMPLE_REQUISITIONS.flatMap((r) => {
    const part = dataset.settings.catalog.find((p) => p.partId === r.partId && p.hasOffers);
    return part ? [{ ...r, system: 'erp' as const, notice: DEMO_DATA_NOTICE, partName: part.partName, category: part.category }] : [];
  });
  const open = dataset.settings.catalog
    .filter((p) => p.hasOffers)
    .map((p, i) => {
      // Parts without a fixed entry (e.g. in tests) get a generic requisition.
      const r = REQUISITIONS[p.partId] ?? {
        recordId: `PR-1004${String(9000 + i)}`,
        partId: p.partId,
        neededBy: '2027-01-29',
        createdOn: '2026-11-06',
        requestedBy: 'Plant Mannheim',
        buyer: 'Thomas',
        status: 'open' as const,
      };
      return {
        ...r,
        system: 'erp' as const,
        notice: DEMO_DATA_NOTICE,
        partName: p.partName,
        category: p.category,
        quantity: p.defaultQuantity!,
        neededBy: p.defaultNeededBy ?? r.neededBy,
      };
    });
  return [...open, ...samples].sort((a, b) => a.neededBy.localeCompare(b.neededBy));
}
