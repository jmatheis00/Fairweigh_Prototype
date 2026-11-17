import type { DecisionRecord } from './decision-record.js';
import { DEMO_DATA_NOTICE } from './demo.js';
import {
  SOURCE_SYSTEMS,
  type DemoDataset,
  type DemoSettings,
  type DocumentRecord,
  type ErpRecord,
  type Offer,
  type PcfRecord,
  type CertificateRecord,
  type CompanyEmissionsRecord,
  type PublicBenchmarkFactor,
  type RatingHistoryEntry,
  type RiskAlert,
  type SupplierPerformanceMonth,
  type PurchaseOrderRecord,
  type PurchaseRequisitionRecord,
  type RatingRecord,
  type SourceSystem,
} from './sources.js';

/**
 * Layout of data/sources/: one folder per simulated system (decision of 8 Nov 2026).
 * The data build writes these files from the team Excel; the server reads them.
 * Paths are relative to data/sources/.
 */
export const SOURCE_FILES = {
  erpSuppliers: 'client-erp/suppliers.json',
  erpQuotations: 'client-erp/quotations.json',
  erpPurchaseOrders: 'client-erp/purchase-orders.json',
  erpRequisitions: 'client-erp/purchase-requisitions.json',
  erpDocuments: 'client-erp/documents.json',
  ratings: 'partner-ratings/ratings.json',
  ratingDocuments: 'partner-ratings/documents.json',
  pcf: 'partner-pcf-exchange/footprints.json',
  supplierDocuments: 'supplier-documents/documents.json',
  settings: 'cockpit/settings.json',
  exampleDecisions: 'cockpit/example-decisions.json',
  publicBenchmarks: 'public-benchmarks/factors.json',
  erpPerformance: 'client-erp/supplier-performance.json',
  ratingHistory: 'partner-ratings/rating-history.json',
  certificates: 'partner-ratings/certificates.json',
  companyEmissions: 'partner-ratings/company-emissions.json',
  riskAlerts: 'partner-risk-monitoring/alerts.json',
} as const;

/** The risk-monitoring partner: not a source system of the agent, shown in the dashboards. */
export const RISK_MONITORING = {
  label: 'Risk monitoring',
  simulates: 'A supply-chain risk monitoring service (style of Prewave / IntegrityNext): alerts per supplier',
  folder: 'partner-risk-monitoring',
};

/** Every JSON file of a system says which system it simulates and that the data is fictitious. */
export interface SourceFile<T> {
  system: string;
  simulates: string;
  notice: string;
  generatedFrom: string;
  records: T[];
}

const COCKPIT = { label: 'Fairweigh', simulates: 'Configuration of Fairweigh itself, not an external system' };
const BENCHMARKS = { label: 'Public benchmarks', simulates: 'Real published industry averages (not simulated), used as CO₂ benchmarks' };
const BENCHMARK_NOTICE = 'Real published data, not fictitious; describes materials, not companies';

function file<T>(owner: { label: string; simulates: string }, generatedFrom: string, records: T[]): SourceFile<T> {
  return { system: owner.label, simulates: owner.simulates, notice: DEMO_DATA_NOTICE, generatedFrom, records };
}

const documentsHeldBy = (d: DemoDataset, system: SourceSystem) => d.documents.filter((x) => x.heldBy === system);

/** The dataset as files: path -> JSON content. PDFs are written separately, at each document's `file`. */
export function splitDataset(d: DemoDataset): Record<string, unknown> {
  const from = d.generatedFrom;
  return {
    [SOURCE_FILES.erpSuppliers]: file(SOURCE_SYSTEMS.erp, from, d.erp),
    [SOURCE_FILES.erpQuotations]: file(SOURCE_SYSTEMS.erp, from, d.offers),
    [SOURCE_FILES.erpPurchaseOrders]: file(SOURCE_SYSTEMS.erp, from, d.purchaseOrders),
    [SOURCE_FILES.erpRequisitions]: file(SOURCE_SYSTEMS.erp, from, d.purchaseRequisitions),
    [SOURCE_FILES.erpDocuments]: file(SOURCE_SYSTEMS.erp, from, documentsHeldBy(d, 'erp')),
    [SOURCE_FILES.ratings]: file(SOURCE_SYSTEMS.ratings, from, d.ratings),
    [SOURCE_FILES.ratingDocuments]: file(SOURCE_SYSTEMS.ratings, from, documentsHeldBy(d, 'ratings')),
    [SOURCE_FILES.pcf]: file(SOURCE_SYSTEMS.pcf, from, d.pcf),
    [SOURCE_FILES.supplierDocuments]: file(SOURCE_SYSTEMS.documents, from, documentsHeldBy(d, 'documents')),
    [SOURCE_FILES.settings]: { ...file(COCKPIT, from, []), settings: d.settings },
    [SOURCE_FILES.exampleDecisions]: file(COCKPIT, from, d.exampleDecisions),
    [SOURCE_FILES.erpPerformance]: file(SOURCE_SYSTEMS.erp, from, d.supplierPerformance),
    [SOURCE_FILES.ratingHistory]: file(SOURCE_SYSTEMS.ratings, from, d.ratingHistory),
    [SOURCE_FILES.certificates]: file(SOURCE_SYSTEMS.ratings, from, d.certificates),
    [SOURCE_FILES.companyEmissions]: file(SOURCE_SYSTEMS.ratings, from, d.companyEmissions),
    [SOURCE_FILES.riskAlerts]: file(RISK_MONITORING, from, d.riskAlerts),
    [SOURCE_FILES.publicBenchmarks]: { ...file(BENCHMARKS, 'data/source/public-benchmarks.json', d.publicBenchmarks), notice: BENCHMARK_NOTICE },
  };
}

/** Reads the files back into one dataset; `read` returns the parsed JSON of a path. */
export function joinDataset(read: (path: string) => unknown): DemoDataset {
  const records = <T>(path: string) => (read(path) as SourceFile<T>).records;
  const erpFile = read(SOURCE_FILES.erpSuppliers) as SourceFile<ErpRecord>;
  return {
    notice: erpFile.notice,
    generatedFrom: erpFile.generatedFrom,
    erp: erpFile.records,
    ratings: records<RatingRecord>(SOURCE_FILES.ratings),
    pcf: records<PcfRecord>(SOURCE_FILES.pcf),
    offers: records<Offer>(SOURCE_FILES.erpQuotations),
    documents: [
      ...records<DocumentRecord>(SOURCE_FILES.supplierDocuments),
      ...records<DocumentRecord>(SOURCE_FILES.erpDocuments),
      ...records<DocumentRecord>(SOURCE_FILES.ratingDocuments),
    ],
    purchaseOrders: records<PurchaseOrderRecord>(SOURCE_FILES.erpPurchaseOrders),
    purchaseRequisitions: records<PurchaseRequisitionRecord>(SOURCE_FILES.erpRequisitions),
    exampleDecisions: records<DecisionRecord>(SOURCE_FILES.exampleDecisions),
    publicBenchmarks: records<PublicBenchmarkFactor>(SOURCE_FILES.publicBenchmarks),
    supplierPerformance: records<SupplierPerformanceMonth>(SOURCE_FILES.erpPerformance),
    ratingHistory: records<RatingHistoryEntry>(SOURCE_FILES.ratingHistory),
    certificates: records<CertificateRecord>(SOURCE_FILES.certificates),
    companyEmissions: records<CompanyEmissionsRecord>(SOURCE_FILES.companyEmissions),
    riskAlerts: records<RiskAlert>(SOURCE_FILES.riskAlerts),
    settings: (read(SOURCE_FILES.settings) as { settings: DemoSettings }).settings,
  };
}
