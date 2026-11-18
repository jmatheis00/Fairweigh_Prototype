import { DEMO_DATA_NOTICE, type DocumentRecord, type ErpRecord, type Offer } from '@scc/shared';
import type { Assumptions } from './assumptions.ts';
import type { SupplierRow } from './build-dataset.ts';

export const BUYER = 'Rhine Valley Drives GmbH, Heilbronn, Germany';

/** The only notice on the PDFs (decision of 8 Nov 2026): one small line at the bottom. */
export const SAMPLE_FOOTER = 'Sample document from the Fairweigh prototype.';

/** 18360 -> "18,360"; 18.36 -> "18.36" (English number format). */
export function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** 2026-10-12 -> "12 Oct 2026". */
export function formatDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The lines of the offer PDF. The same lines go into the PDF and into the
 * document record, so the evidence check can find a value on its page.
 */
export function offerDocument(offer: Offer, erp: ErpRecord): DocumentRecord {
  const total = offer.unitPriceEur * offer.quantity;
  const lines = [
    `${erp.supplierName}`,
    `${erp.city}, ${erp.country}`,
    offer.priceType === 'indicative' ? `Indicative quotation ${offer.offerId}` : `Quotation ${offer.offerId}`,
    `Date: ${formatDate(offer.priceDate)}`,
    `To: ${BUYER}`,
    `Supplier ID: ${offer.supplierId}`,
    `Part: ${offer.partName} (${offer.partId})`,
    `Quantity: ${formatNumber(offer.quantity, 0)} pcs`,
    offer.priceType === 'indicative'
      ? `Unit price: EUR ${formatNumber(offer.unitPriceEur, 2)} per piece (indicative, not binding)`
      : `Unit price: EUR ${formatNumber(offer.unitPriceEur, 2)} per piece`,
    `Total: EUR ${formatNumber(total, 2)}`,
    offer.leadTimeDays === null
      ? 'Lead time: on request'
      : `Lead time: ${offer.leadTimeDays} days`,
    `Valid until: ${formatDate(offer.validUntil)}`,
    'Prices ex works, excluding VAT.',
    SAMPLE_FOOTER,
  ];

  return {
    recordId: offer.sourceDocumentId,
    documentId: offer.sourceDocumentId,
    system: 'documents',
    supplierId: offer.supplierId,
    notice: DEMO_DATA_NOTICE,
    provenance: { ...offer.provenance, assumedFields: [...offer.provenance.assumedFields] },
    documentType: 'offer',
    title: `Quotation ${offer.offerId}`,
    file: `supplier-documents/quotations/${offer.sourceDocumentId}.pdf`,
    heldBy: 'documents',
    issuedOn: offer.priceDate,
    pages: [{ page: 1, lines }],
  };
}

/**
 * A fictitious fine notice: a final decision by an authority. The evidence
 * check accepts it as proof of a legal violation, which means knock-out.
 */
export function fineNoticeDocument(
  row: SupplierRow,
  erp: ErpRecord,
  fine: Assumptions['fineNotices'][string],
): DocumentRecord {
  const documentId = `DOC-FINE-${erp.supplierId}`;
  const lines = [
    'Notice of administrative fine',
    `Issued by: ${fine.authority}`,
    `Date: ${formatDate(fine.issuedOn)}`,
    `Company: ${erp.supplierName}, ${erp.city}, ${erp.country}`,
    `Supplier ID: ${erp.supplierId}`,
    `Decision: ${fine.decision}`,
    `Status: ${fine.status}`,
    SAMPLE_FOOTER,
  ];
  return {
    recordId: documentId,
    documentId,
    system: 'documents',
    supplierId: erp.supplierId,
    notice: DEMO_DATA_NOTICE,
    provenance: {
      file: 'data/assumptions.json',
      sheet: 'fineNotices',
      row: row.row,
      assumedFields: ['issuedOn', 'authority', 'decision', 'status'],
    },
    documentType: 'fine_notice',
    title: `Notice of administrative fine, ${erp.supplierName}`,
    file: `supplier-documents/authority-notices/${documentId}.pdf`,
    heldBy: 'documents',
    issuedOn: fine.issuedOn,
    pages: [{ page: 1, lines }],
  };
}
