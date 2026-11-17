import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { joinDataset } from '@scc/shared';
import type {
  CertificateRecord,
  CompanyEmissionsRecord,
  RatingHistoryEntry,
  RiskAlert,
  SupplierPerformanceMonth,
  DecisionRecord,
  DemoDataset,
  DemoSettings,
  DocumentRecord,
  ErpRecord,
  Offer,
  PcfRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionRecord,
  RatingRecord,
} from '@scc/shared';

/** A record of any simulated source system. */
export type SourceRecord = ErpRecord | RatingRecord | PcfRecord | DocumentRecord | PurchaseOrderRecord;

/**
 * Read access to the simulated source systems.
 * This is the storage interface from PLAN.md: today it reads JSON files,
 * later a database can implement the same methods.
 */
export abstract class DemoDataRepository {
  abstract getErpRecord(supplierId: string): ErpRecord | undefined;
  abstract getRating(supplierId: string): RatingRecord | undefined;
  /** All suppliers in the ERP (suppliers page). */
  abstract listErpRecords(): ErpRecord[];
  /** All ratings (suppliers page). */
  abstract listRatings(): RatingRecord[];
  /** Past purchase orders (start-page statistics). */
  abstract listPurchaseOrders(): PurchaseOrderRecord[];
  /** Open purchase requisitions (work queue). */
  abstract listPurchaseRequisitions(): PurchaseRequisitionRecord[];
  /** All PCF records (sustainability page). */
  abstract listPcf(): PcfRecord[];
  /** All documents of one type, e.g. fine notices (sustainability page). */
  abstract listDocumentsOfType(type: DocumentRecord['documentType']): DocumentRecord[];
  /** Example decisions for the decision log (fictitious). */
  abstract listExampleDecisions(): DecisionRecord[];
  abstract getPcf(supplierId: string, partId: string): PcfRecord | undefined;
  abstract listDocuments(supplierId: string): DocumentRecord[];
  abstract getDocument(documentId: string): DocumentRecord | undefined;
  abstract listOffers(): Offer[];
  abstract getSettings(): DemoSettings;
  /** Any record or document by its ID, e.g. "ERP-S-0013" or "DOC-OFFER-S-0013-P-ALU-HSG-01". */
  abstract findRecord(recordId: string): SourceRecord | undefined;
  /** The PDF of a document, or undefined if the document does not exist. */
  abstract getDocumentFile(documentId: string): Promise<Buffer | undefined>;
  /** Client ERP: vendor evaluation per supplier and month. */
  abstract listSupplierPerformance(): SupplierPerformanceMonth[];
  /** Rating partner: assessments per year, certificates, company emissions. */
  abstract listRatingHistory(): RatingHistoryEntry[];
  abstract listCertificates(): CertificateRecord[];
  abstract listCompanyEmissions(): CompanyEmissionsRecord[];
  /** Risk-monitoring partner: alerts, most severe first. */
  abstract listRiskAlerts(): RiskAlert[];
}

/** Folder data/sources/ with one sub-folder per simulated system. Override with DATA_DIR. */
export function defaultDataDir(): string {
  return process.env.DATA_DIR ?? resolve(process.cwd(), '../data/sources');
}

/** Reads the system folders in data/sources/ once at start-up (layout: SOURCE_FILES in shared). */
export class JsonFileDemoDataRepository extends DemoDataRepository {
  private readonly dataset: DemoDataset;

  constructor(private readonly dataDir: string = defaultDataDir()) {
    super();
    try {
      this.dataset = joinDataset((path) => JSON.parse(readFileSync(join(dataDir, path), 'utf8')) as unknown);
    } catch (error) {
      throw new Error(`Cannot read the source systems in ${dataDir}. Run: npm run data:build`, {
        cause: error,
      });
    }
  }

  getErpRecord(supplierId: string): ErpRecord | undefined {
    return this.dataset.erp.find((r) => r.supplierId === supplierId);
  }

  getRating(supplierId: string): RatingRecord | undefined {
    return this.dataset.ratings.find((r) => r.supplierId === supplierId);
  }

  listErpRecords(): ErpRecord[] {
    return this.dataset.erp;
  }

  listRatings(): RatingRecord[] {
    return this.dataset.ratings;
  }

  listPurchaseOrders(): PurchaseOrderRecord[] {
    return this.dataset.purchaseOrders ?? [];
  }

  listPcf(): PcfRecord[] {
    return this.dataset.pcf;
  }

  listDocumentsOfType(type: DocumentRecord['documentType']): DocumentRecord[] {
    return this.dataset.documents.filter((d) => d.documentType === type);
  }

  listPurchaseRequisitions(): PurchaseRequisitionRecord[] {
    return this.dataset.purchaseRequisitions ?? [];
  }

  listExampleDecisions(): DecisionRecord[] {
    return this.dataset.exampleDecisions ?? [];
  }

  getPcf(supplierId: string, partId: string): PcfRecord | undefined {
    return this.dataset.pcf.find((r) => r.supplierId === supplierId && r.partId === partId);
  }

  listDocuments(supplierId: string): DocumentRecord[] {
    return this.dataset.documents.filter((d) => d.supplierId === supplierId);
  }

  getDocument(documentId: string): DocumentRecord | undefined {
    return this.dataset.documents.find((d) => d.documentId === documentId);
  }

  listOffers(): Offer[] {
    return this.dataset.offers;
  }

  getSettings(): DemoSettings {
    return this.dataset.settings;
  }

  findRecord(recordId: string): SourceRecord | undefined {
    const all: SourceRecord[] = [
      ...this.dataset.erp,
      ...this.dataset.ratings,
      ...this.dataset.pcf,
      ...this.dataset.documents,
      ...(this.dataset.purchaseOrders ?? []),
    ];
    return all.find((r) => r.recordId === recordId);
  }

  listSupplierPerformance(): SupplierPerformanceMonth[] {
    return this.dataset.supplierPerformance ?? [];
  }

  listRatingHistory(): RatingHistoryEntry[] {
    return this.dataset.ratingHistory ?? [];
  }

  listCertificates(): CertificateRecord[] {
    return this.dataset.certificates ?? [];
  }

  listCompanyEmissions(): CompanyEmissionsRecord[] {
    return this.dataset.companyEmissions ?? [];
  }

  listRiskAlerts(): RiskAlert[] {
    return this.dataset.riskAlerts ?? [];
  }

  async getDocumentFile(documentId: string): Promise<Buffer | undefined> {
    const document = this.getDocument(documentId);
    if (!document) return undefined;
    // The path comes from our own record, never from the request.
    return readFile(join(this.dataDir, document.file));
  }
}
