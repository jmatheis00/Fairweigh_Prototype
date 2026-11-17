import { DEMO_DATA_NOTICE, type CertificateRecord, type DemoDataset, type DocumentRecord, type PcfRecord, type PurchaseOrderRecord, type RatingRecord } from '@scc/shared';
import { BUYER, SAMPLE_FOOTER, formatDate, formatNumber } from './offer-document.ts';

/**
 * PDFs that real systems would hold next to their data (decision of 8 Nov 2026):
 * order PDFs in the client ERP, scorecards at the rating partner, PCF data sheets
 * sent by suppliers. The same lines go into the PDF and the document record, so a
 * value can be found on its page. All content is built from the records; nothing new is invented.
 */

const FOOTER = SAMPLE_FOOTER;

const yesNo = (v: boolean | null) => (v === null ? 'not stated' : v ? 'yes' : 'no');

function base(
  documentId: string,
  supplierId: string,
  provenance: DocumentRecord['provenance'],
): Pick<DocumentRecord, 'recordId' | 'documentId' | 'system' | 'supplierId' | 'notice' | 'provenance'> {
  return { recordId: documentId, documentId, system: 'documents', supplierId, notice: DEMO_DATA_NOTICE, provenance };
}

/** Order PDF from the client ERP, one per purchase order. */
export function purchaseOrderDocument(po: PurchaseOrderRecord, supplierName: string): DocumentRecord {
  const documentId = `DOC-${po.poNumber}`;
  const lines = [
    `Purchase order ${po.poNumber}`,
    `Date: ${formatDate(po.orderDate)}`,
    `Buyer: ${BUYER}`,
    `Supplier: ${supplierName}, supplier ID ${po.supplierId}`,
    `Part: ${po.partName} (${po.partId})`,
    `Quantity: ${formatNumber(po.quantity, 0)} pcs`,
    `Unit price: EUR ${formatNumber(po.unitPriceEur, 2)} per piece`,
    `Total: EUR ${formatNumber(po.unitPriceEur * po.quantity, 2)}`,
    po.cockpitDecisionId ? `Reference: cockpit decision ${po.cockpitDecisionId}` : 'Reference: existing contract',
    FOOTER,
  ];
  return {
    ...base(documentId, po.supplierId, { ...po.provenance, assumedFields: [...po.provenance.assumedFields] }),
    documentType: 'purchase_order',
    title: `Purchase order ${po.poNumber}`,
    file: `client-erp/purchase-orders/${documentId}.pdf`,
    heldBy: 'erp',
    issuedOn: po.orderDate,
    pages: [{ page: 1, lines }],
  };
}

/** Scorecard PDF of the rating partner, in the style of an EcoVadis scorecard. */
export function scorecardDocument(rating: RatingRecord, supplierName: string, fallbackDate: string): DocumentRecord {
  const documentId = `DOC-SCORECARD-${rating.supplierId}`;
  const issuedOn = rating.lastUpdated ?? fallbackDate;
  const lines = [
    'Sustainability scorecard',
    `Company: ${supplierName}, supplier ID ${rating.supplierId}`,
    `Assessment date: ${formatDate(issuedOn)}`,
    `Overall score: ${rating.sustainabilityScore === null ? 'not rated' : `${rating.sustainabilityScore} / 100`}`,
    `LkSG country risk: ${rating.lksgCountryRisk ?? 'not rated'}`,
    `Certifications: ${rating.certifications ?? 'none stated'}`,
    `Science-based target (SBTi): ${yesNo(rating.sbtiTarget)}`,
    `Sustainability report published: ${yesNo(rating.sustainabilityReport)}`,
    `Controversies: ${rating.controversies ?? 'not assessed'}`,
    `CO2 data source used: ${rating.co2DataSource ?? 'not stated'}`,
    FOOTER,
  ];
  return {
    ...base(documentId, rating.supplierId, {
      ...rating.provenance,
      assumedFields: [...rating.provenance.assumedFields, ...(rating.lastUpdated ? [] : ['issuedOn'])],
    }),
    documentType: 'rating_scorecard',
    title: `Sustainability scorecard, ${supplierName}`,
    file: `partner-ratings/scorecards/${documentId}.pdf`,
    heldBy: 'ratings',
    issuedOn,
    pages: [{ page: 1, lines }],
  };
}

/** PCF data sheet sent by the supplier. Only for footprints that did not come through the PACT exchange. */
export function pcfDatasheetDocument(pcf: PcfRecord, supplierName: string, partName: string): DocumentRecord {
  const documentId = `DOC-PCF-${pcf.supplierId}-${pcf.partId}`;
  const lines = [
    'Product carbon footprint data sheet',
    `Supplier: ${supplierName}, supplier ID ${pcf.supplierId}`,
    `Product: ${partName} (${pcf.partId})`,
    `PCF: ${formatNumber(pcf.pcfKgPerPiece, 1)} kg CO2e per piece`,
    `Method: ${pcf.method}`,
    `Reference date: ${formatDate(pcf.referenceDate)}`,
    `Primary data share: ${pcf.primaryDataSharePercent === null ? 'not stated' : `${pcf.primaryDataSharePercent} %`}`,
    `Third-party assurance: ${pcf.assurance ?? 'none'}`,
    FOOTER,
  ];
  return {
    ...base(documentId, pcf.supplierId, { ...pcf.provenance, assumedFields: [...pcf.provenance.assumedFields] }),
    documentType: 'pcf_datasheet',
    title: `PCF data sheet, ${supplierName}, ${pcf.partId}`,
    file: `supplier-documents/pcf-datasheets/${documentId}.pdf`,
    heldBy: 'documents',
    issuedOn: pcf.referenceDate,
    pages: [{ page: 1, lines }],
  };
}

/** Certificate PDF sent by the supplier (ISO 14001, SA8000, …). */
export function certificateDocument(c: CertificateRecord, supplierName: string): DocumentRecord {
  const documentId = `DOC-${c.certificateId}`;
  const lines = [
    `Certificate ${c.standard}`,
    `Holder: ${supplierName}, supplier ID ${c.supplierId}`,
    `Standard: ${c.standard}`,
    `Valid from: ${formatDate(c.validFrom)}`,
    `Valid until: ${formatDate(c.validUntil)}`,
    'Issued by: accredited certification body',
    FOOTER,
  ];
  return {
    ...base(documentId, c.supplierId, { file: 'Supplier_Dummy_Data_v2.xlsx', sheet: 'Suppliers', row: 0, assumedFields: ['validFrom', 'validUntil'] }),
    documentType: 'certificate',
    title: `Certificate ${c.standard}, ${supplierName}`,
    file: `supplier-documents/certificates/${documentId}.pdf`,
    heldBy: 'documents',
    issuedOn: c.validFrom,
    pages: [{ page: 1, lines }],
  };
}

/** A supplier-specific footprint arrives as a data sheet unless the record says it came through the PACT exchange. */
function cameAsDatasheet(pcf: PcfRecord): boolean {
  if (pcf.badge !== 'Verified' && pcf.badge !== 'Supplier-specific') return false;
  return !/PACT/i.test(pcf.source?.sourceType ?? '');
}

/**
 * Adds the supporting PDFs to the dataset and links them from their records.
 * Scorecards for every rated supplier; certificate PDFs for the suppliers in current requests and orders.
 */
export function addSupportingDocuments(dataset: DemoDataset, partNames: Record<string, string>, fallbackDate: string): void {
  const name = (supplierId: string) => dataset.erp.find((e) => e.supplierId === supplierId)?.supplierName ?? supplierId;
  for (const po of dataset.purchaseOrders) {
    const doc = purchaseOrderDocument(po, name(po.supplierId));
    dataset.documents.push(doc);
    po.documentId = doc.documentId;
  }
  const involved = new Set([...dataset.offers.map((o) => o.supplierId), ...dataset.purchaseOrders.map((p) => p.supplierId)]);
  for (const rating of dataset.ratings) {
    if (rating.sustainabilityScore === null) {
      rating.scorecardDocumentId = null;
      continue;
    }
    const doc = scorecardDocument(rating, name(rating.supplierId), fallbackDate);
    dataset.documents.push(doc);
    rating.scorecardDocumentId = doc.documentId;
  }
  for (const c of dataset.certificates) {
    if (!involved.has(c.supplierId)) continue;
    const doc = certificateDocument(c, name(c.supplierId));
    dataset.documents.push(doc);
    c.documentId = doc.documentId;
  }
  for (const pcf of dataset.pcf) {
    if (!cameAsDatasheet(pcf)) {
      pcf.datasheetDocumentId = null;
      continue;
    }
    const doc = pcfDatasheetDocument(pcf, name(pcf.supplierId), partNames[pcf.partId] ?? pcf.partId);
    dataset.documents.push(doc);
    pcf.datasheetDocumentId = doc.documentId;
  }
}
