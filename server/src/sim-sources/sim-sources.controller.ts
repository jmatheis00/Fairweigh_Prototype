import { Controller, Get, Header, NotFoundException, Param, Query, StreamableFile } from '@nestjs/common';
import { DOCUMENT_TYPES } from '@scc/shared';
import type {
  CertificateRecord,
  CompanyEmissionsRecord,
  DecisionRecord,
  DemoSettings,
  DocumentRecord,
  DocumentType,
  ErpRecord,
  Offer,
  PcfRecord,
  PurchaseOrderRecord,
  PurchaseRequisitionRecord,
  RatingHistoryEntry,
  RatingRecord,
  RiskAlert,
  SupplierPerformanceMonth,
} from '@scc/shared';
import { DemoDataRepository } from './demo-data.repository.js';

function found<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new NotFoundException(`${what} not found`);
  }
  return value;
}

/**
 * The simulated source systems (PLAN.md, section 5). The agent's tools call
 * these endpoints, and the cockpit uses them to open a source.
 */
@Controller('sim')
export class SimSourcesController {
  constructor(private readonly data: DemoDataRepository) {}

  /** Product list and defaults for the request form. */
  @Get('settings')
  getSettings(): DemoSettings {
    return this.data.getSettings();
  }

  /** All suppliers in the ERP, for the suppliers page. */
  @Get('erp/suppliers')
  listErpRecords(): ErpRecord[] {
    return this.data.listErpRecords();
  }

  /** Past purchase orders, for the statistics on the start page. */
  @Get('erp/purchase-orders')
  listPurchaseOrders(): PurchaseOrderRecord[] {
    return this.data.listPurchaseOrders();
  }

  /** Example decisions for the decision log (fictitious, built from the demo data). */
  @Get('example-decisions')
  listExampleDecisions(): DecisionRecord[] {
    return this.data.listExampleDecisions();
  }

  /** All ratings, for the suppliers page. */
  @Get('ratings/suppliers')
  listRatings(): RatingRecord[] {
    return this.data.listRatings();
  }

  @Get('erp/suppliers/:supplierId')
  getErpRecord(@Param('supplierId') supplierId: string): ErpRecord {
    return found(this.data.getErpRecord(supplierId), `ERP record for ${supplierId}`);
  }

  @Get('ratings/suppliers/:supplierId')
  getRating(@Param('supplierId') supplierId: string): RatingRecord {
    return found(this.data.getRating(supplierId), `Rating for ${supplierId}`);
  }

  @Get('pcf/suppliers/:supplierId/parts/:partId')
  getPcf(@Param('supplierId') supplierId: string, @Param('partId') partId: string): PcfRecord {
    return found(this.data.getPcf(supplierId, partId), `PCF for ${supplierId} and ${partId}`);
  }

  /** Documents of one supplier, or of one type (e.g. ?type=fine_notice for the sustainability page). */
  @Get('documents')
  listDocuments(@Query('supplierId') supplierId?: string, @Query('type') type?: string): DocumentRecord[] {
    if (supplierId) return this.data.listDocuments(supplierId);
    if (type && (DOCUMENT_TYPES as string[]).includes(type)) return this.data.listDocumentsOfType(type as DocumentType);
    throw new NotFoundException(`Query parameter supplierId or type (${DOCUMENT_TYPES.join(', ')}) is required`);
  }

  /** Client ERP: open purchase requisitions (the buyer's work queue). */
  @Get('erp/purchase-requisitions')
  listPurchaseRequisitions(): PurchaseRequisitionRecord[] {
    return this.data.listPurchaseRequisitions();
  }

  /** Client ERP: quotations registered for the current requests. */
  @Get('erp/quotations')
  listQuotations(): Offer[] {
    return this.data.listOffers();
  }

  /** Client ERP: vendor evaluation per supplier and month (24 months). */
  @Get('erp/supplier-performance')
  listSupplierPerformance(): SupplierPerformanceMonth[] {
    return this.data.listSupplierPerformance();
  }

  /** Rating partner: assessments per year. */
  @Get('ratings/history')
  listRatingHistory(): RatingHistoryEntry[] {
    return this.data.listRatingHistory();
  }

  /** Rating partner: certificates with validity. */
  @Get('ratings/certificates')
  listCertificates(): CertificateRecord[] {
    return this.data.listCertificates();
  }

  /** Rating partner: company-level emissions. */
  @Get('ratings/company-emissions')
  listCompanyEmissions(): CompanyEmissionsRecord[] {
    return this.data.listCompanyEmissions();
  }

  /** Risk-monitoring partner: alerts, most severe first. */
  @Get('risk/alerts')
  listRiskAlerts(): RiskAlert[] {
    return this.data.listRiskAlerts();
  }

  /** All PCF records, for the sustainability page. */
  @Get('pcf')
  listPcf(): PcfRecord[] {
    return this.data.listPcf();
  }

  @Get('documents/:documentId')
  getDocument(@Param('documentId') documentId: string): DocumentRecord {
    return found(this.data.getDocument(documentId), `Document ${documentId}`);
  }

  @Get('documents/:documentId/file')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'inline')
  async getDocumentFile(@Param('documentId') documentId: string): Promise<StreamableFile> {
    const file = found(await this.data.getDocumentFile(documentId), `Document ${documentId}`);
    return new StreamableFile(file);
  }
}
