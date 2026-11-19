import type { BuyerProfile, Co2Targets } from './co2-targets.js';
import type { DecisionRecord } from './decision-record.js';
import type { Benchmark, Benchmarks, NewSupplierAssumption } from './decision.js';

/**
 * Records of the simulated source systems (PLAN.md, section 5).
 * All values are fictitious demo data.
 */

/** The four simulated source systems the agent can query. */
export type SourceSystem = 'erp' | 'ratings' | 'pcf' | 'documents';

/**
 * The simulated systems the agent reads, one folder each in data/sources/
 * (decision of 8 Nov 2026). All supplier data in them is fictitious.
 */
export const SOURCE_SYSTEMS: Record<SourceSystem, { label: string; simulates: string; folder: string }> = {
  erp: { label: 'Client ERP', simulates: "The buyer's own ERP (style of SAP S/4HANA): supplier master, performance, quotations, purchase orders", folder: 'client-erp' },
  ratings: { label: 'Rating partner', simulates: 'A sustainability rating provider (style of EcoVadis): scores, LkSG risk, certificates, scorecards', folder: 'partner-ratings' },
  pcf: { label: 'PCF exchange', simulates: 'A product footprint exchange (style of PACT / SAP SDX): CO₂ per piece with data quality', folder: 'partner-pcf-exchange' },
  documents: { label: 'Supplier documents', simulates: 'Documents received from or about suppliers: quotations, PCF data sheets, authority notices', folder: 'supplier-documents' },
};

/** Where a record came from, so every value can be traced back to the Excel. */
export interface SourceProvenance {
  file: string;
  sheet: string;
  row: number;
  /**
   * Fields that are not in the Excel but set in data/assumptions.json.
   * They are fictitious placeholders that the team still has to confirm.
   */
  assumedFields: string[];
}

/** Common fields of every record in a simulated source system. */
export interface SourceRecordBase {
  /** Unique ID inside its system, e.g. "ERP-S-0013". */
  recordId: string;
  system: SourceSystem;
  supplierId: string;
  /** Always the demo data notice ("Demo data, fictitious"). */
  notice: string;
  provenance: SourceProvenance;
}

/** Supplier master data and purchasing history (simulated ERP). */
export interface ErpRecord extends SourceRecordBase {
  system: 'erp';
  supplierName: string;
  country: string;
  city: string;
  category: string;
  products: string;
  relationshipStatus: string;
  contractStart: string | null;
  contractEnd: string | null;
  lastQuoteDate: string | null;
  annualSpendEur: number | null;
  priceIndex: number | null;
  leadTimeDays: number | null;
  /** Share of on-time deliveries in percent (89 means 89 %). Delivery reliability criterion. */
  onTimeDeliveryPercent: number | null;
  /** Share of deliveries with complaints in percent (0.8 means 0.8 %). Product quality criterion. */
  complaintRatePercent: number | null;
  /** When the supplier's record was last updated (Excel: last_updated); the "as of" date of its values. */
  lastUpdated: string | null;
  /** Match keys from Excel v2. */
  vatId: string | null;
  erpId: string | null;
}

/** Sustainability rating and compliance screening (simulated rating provider). */
export interface RatingRecord extends SourceRecordBase {
  system: 'ratings';
  /** Rating 0–100 in the style of EcoVadis. */
  sustainabilityScore: number | null;
  certifications: string | null;
  sbtiTarget: boolean | null;
  lksgCountryRisk: 'Low' | 'Medium' | 'High' | null;
  controversies: string | null;
  lastUpdated: string | null;
  /** Status of the request for more sustainability data: "Answered", "Requested", "Not requested". */
  infoRequestStatus: string | null;
  /** Where the CO2 data comes from, e.g. "Sustainability report", "Supplier self-assessment". */
  co2DataSource: string | null;
  /** Whether the supplier publishes a sustainability report. */
  sustainabilityReport: boolean | null;
  /** Scorecard PDF of the rating partner, for suppliers in current requests; null otherwise. */
  scorecardDocumentId?: string | null;
}

/**
 * Data-quality ladder for CO₂ per piece (team data model, 8 Nov 2026):
 * 1 Verified (PCF via PACT/SAP SDX, third-party assured) · 2 Supplier-specific
 * (PCF from the supplier) · 3 Company estimate (company emissions allocated to
 * the offer) · 4 Industry average (sector factor × price, flagged).
 */
export type PcfBadge = 'Verified' | 'Supplier-specific' | 'Company estimate' | 'Industry average';

export const PCF_BADGE_LEVEL: Record<PcfBadge, 1 | 2 | 3 | 4> = {
  Verified: 1,
  'Supplier-specific': 2,
  'Company estimate': 3,
  'Industry average': 4,
};

/** Levels 1 and 2 are primary data from the supplier (ESRS E1: share of Scope 3 from primary data). */
export function isSupplierSpecific(badge: PcfBadge | null | undefined): boolean {
  return badge === 'Verified' || badge === 'Supplier-specific';
}

/** Where a CO₂ value comes from (Excel v2, sheet "Sources"). Links are fictitious. */
export interface PcfSource {
  sourceId: string;
  sourceType: string;
  link: string | null;
  retrievedOn: string | null;
  /** "Sure" when matched via VAT ID or integration ID, "Uncertain" when only the name matched. */
  match: 'Sure' | 'Uncertain' | null;
  note: string | null;
}

/** Product carbon footprint per piece (simulated PCF exchange). */
export interface PcfRecord extends SourceRecordBase {
  system: 'pcf';
  partId: string;
  /** kg CO2e per piece. CO2 criterion. */
  pcfKgPerPiece: number;
  badge: PcfBadge;
  /** Date the PCF value was stated (end of the reference year for values from Excel v2). */
  referenceDate: string;
  method: string;
  /** PCF data sheet PDF sent by the supplier, if the footprint came as a document; null otherwise. */
  datasheetDocumentId?: string | null;
  /** Excel v2 fields; null where the data has none (steel and copper). */
  boundary: string | null;
  referenceYear: number | null;
  /** Share of primary data in percent (60 means 60 %). */
  primaryDataSharePercent: number | null;
  assurance: string | null;
  source: PcfSource | null;
}

/** An offer for one part (PLAN.md, section 5, "New: offers"). */
export interface Offer {
  offerId: string;
  supplierId: string;
  partId: string;
  partName: string;
  quantity: number;
  /** Euro per piece. Price criterion. */
  unitPriceEur: number;
  priceDate: string;
  validUntil: string;
  leadTimeDays: number | null;
  /** "indicative": not binding, shown as a warning. */
  priceType: 'firm' | 'indicative';
  /** Document in which the offer is stated (PDF follows in step 3). */
  sourceDocumentId: string;
  notice: string;
  provenance: SourceProvenance;
}

/**
 * A past purchase order (simulated ERP, added 6 Nov 2026). Fictitious history
 * for the statistics on the start page; in a real system it comes from the ERP.
 */
export interface PurchaseOrderRecord extends SourceRecordBase {
  system: 'erp';
  /** Same as recordId, e.g. "PO-4500012301". */
  poNumber: string;
  /** Order PDF in the client ERP. */
  documentId?: string | null;
  orderDate: string;
  partId: string;
  partName: string;
  quantity: number;
  unitPriceEur: number;
  /** kg CO2e per piece from the PCF record of this supplier and part. */
  pcfKgPerPiece: number;
  pcfBadge: PcfBadge;
  pcfRecordId: string;
  /** Set when the supplier was chosen with a decision in the cockpit. */
  cockpitDecisionId: string | null;
  /** The supplier this order replaced, and its PCF per piece, if the decision switched supplier. */
  replacedSupplierId: string | null;
  replacedPcfKgPerPiece: number | null;
  /** Unit price of the replaced supplier for this part (same price rule), for the extra cost. */
  replacedUnitPriceEur: number | null;
}

/**
 * An open purchase requisition in the client ERP (simulated SAP purchase-requisition
 * queue, added 10 Nov 2026). The work queue on the start page lists them.
 */
export interface PurchaseRequisitionRecord {
  /** Requisition number, e.g. "PR-10041207". */
  recordId: string;
  system: 'erp';
  notice: string;
  partId: string;
  partName: string;
  /** Commodity group (the part's category). */
  category: string;
  quantity: number;
  neededBy: string;
  createdOn: string;
  /** Who raised the requisition, e.g. a plant or production line. */
  requestedBy: string;
  /** Buyer the requisition is assigned to. */
  buyer: string;
  /**
   * Status in the ERP: "open" (not started), "in progress" (sourcing started earlier) or "closed" (awarded and
   * ordered). Progress within the cockpit is tracked by the cockpit itself.
   */
  status: 'open' | 'in progress' | 'closed';
  /** Set when the buyer added the requisition by hand in Fairweigh instead of it coming from the ERP (18 Nov 2026). */
  origin?: 'manual';
}

/** One page of a document, as the lines of text printed on it. */
export interface DocumentPage {
  /** Page number, starting at 1. */
  page: number;
  lines: string[];
}

/**
 * "fine_notice": a final decision by an authority, i.e. a proven legal violation.
 * "purchase_order": order PDF from the client ERP; "rating_scorecard": scorecard PDF of the rating partner;
 * "pcf_datasheet": product carbon footprint data sheet sent by the supplier.
 */
export type DocumentType = 'offer' | 'fine_notice' | 'purchase_order' | 'rating_scorecard' | 'pcf_datasheet' | 'certificate';
export const DOCUMENT_TYPES: DocumentType[] = ['offer', 'fine_notice', 'purchase_order', 'rating_scorecard', 'pcf_datasheet', 'certificate'];

/** A PDF in the simulated document system, plus its text for search and checks. */
export interface DocumentRecord extends SourceRecordBase {
  system: 'documents';
  /** Same as recordId, e.g. "DOC-OFFER-S-0013-P-ALU-HSG-01". */
  documentId: string;
  documentType: DocumentType;
  title: string;
  /** Path of the PDF inside data/sources/, e.g. "supplier-documents/quotations/DOC-OFFER-….pdf". */
  file: string;
  /** The system whose folder holds the file. */
  heldBy: SourceSystem;
  issuedOn: string;
  pages: DocumentPage[];
}

/** A product the buyer can pick in the request form. */
export interface CatalogPart {
  partId: string;
  partName: string;
  category: string;
  /** Only parts with offers in the demo data can be selected. */
  hasOffers: boolean;
  /** Default quantity for the request form; null for parts without offers. */
  defaultQuantity: number | null;
  /** Supplier of this part today (simulated ERP source list); null if none. */
  currentSupplierId: string | null;
  /** Default weights of the part's category (Excel v2 without "performance", scaled to 100 %). */
  defaultWeights: { quality: number; price: number; co2: number; delivery: number } | null;
  /** Default needed-by date (the due date of the demo request in Excel v2). */
  defaultNeededBy: string | null;
  /**
   * Reference values the points are measured against: what we have today, i.e. the current supplier
   * (decision of 17 Nov 2026, replaces the benchmarks of 8 Nov 2026); null for parts without offers.
   */
  benchmarks: Benchmarks | null;
  /** Published industry average CO₂ per piece (material only). Context only, never scored (17 Nov 2026). */
  industryCo2: Benchmark | null;
  /** Weakest quality and delivery of our current suppliers in the category, for suppliers that never delivered. */
  newSupplierAssumption: NewSupplierAssumption | null;
}

/** Settings for the request form and the display (not for the score). */
export interface DemoSettings {
  catalog: CatalogPart[];
  defaultQuantity: number;
  /** Only for the CO2 euro display. Placeholder until the team confirms it. */
  co2PricePerTonneEur: number;
  co2PriceToConfirm: boolean;
  /** Prices older than this show "outdated" (score unchanged). */
  priceMaxAgeDays: number;
  /** CO2 values older than this show "old CO2 data" (score unchanged). */
  co2MaxAgeDays: number;
  /** Buyers and their commodity groups (fictitious, 10 Nov 2026). */
  buyers: BuyerProfile[];
  /** CO₂ targets until the Scope 3 manager sets her own (fictitious, 10 Nov 2026). */
  defaultCo2Targets: Co2Targets;
}

/** Everything the import script generates from the Excel. */
export interface DemoDataset {
  notice: string;
  generatedFrom: string;
  erp: ErpRecord[];
  ratings: RatingRecord[];
  pcf: PcfRecord[];
  offers: Offer[];
  documents: DocumentRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  /** Open purchase requisitions (work queue, 10 Nov 2026). */
  purchaseRequisitions: PurchaseRequisitionRecord[];
  /** Real published CO₂ factors per kg of material (data/source/public-benchmarks.json). */
  publicBenchmarks: PublicBenchmarkFactor[];
  /** Client ERP: deliveries, on-time deliveries, complaints and spend per supplier and month. */
  supplierPerformance: SupplierPerformanceMonth[];
  /** Rating partner: score per assessment year. */
  ratingHistory: RatingHistoryEntry[];
  /** Rating partner: certificates with validity. */
  certificates: CertificateRecord[];
  /** Rating partner: company-level emissions (CSRD style). */
  companyEmissions: CompanyEmissionsRecord[];
  /** Risk-monitoring partner: alerts per supplier. */
  riskAlerts: RiskAlert[];
  /** Two example decisions for the decision log (fictitious, July 2026). */
  exampleDecisions: DecisionRecord[];
  settings: DemoSettings;
}

/** A real, published industry average per kg of material (not fictitious, decision of 8 Nov 2026). */
export interface PublicBenchmarkFactor {
  factorId: string;
  material: string;
  valueKgCo2ePerKg: number;
  /** "CO₂e" (all greenhouse gases) or "CO₂" (carbon dioxide only, e.g. worldsteel). */
  gas: 'CO₂e' | 'CO₂';
  scope: string;
  referenceYear: number;
  publisher: string;
  title: string;
  url: string;
  retrievedOn: string;
  note: string;
}

/**
 * One month of a supplier in the client ERP (vendor evaluation). The ERP's KPIs
 * (on-time %, complaint rate %, spend per year) are the sums of the last 12 months.
 */
export interface SupplierPerformanceMonth {
  supplierId: string;
  /** YYYY-MM */
  month: string;
  deliveries: number;
  onTimeDeliveries: number;
  /** Quality notifications (complaints) raised on these deliveries. */
  qualityNotifications: number;
  spendEur: number;
}

/** A sustainability rating of one assessment year. */
export interface RatingHistoryEntry {
  supplierId: string;
  year: number;
  score: number;
  assessedOn: string;
}

/** A management-system certificate (ISO 14001, SA8000, …) as listed by the rating partner. */
export interface CertificateRecord {
  certificateId: string;
  supplierId: string;
  standard: string;
  validFrom: string;
  validUntil: string;
  /** PDF in supplier-documents/certificates/, for suppliers in current requests and orders; null otherwise. */
  documentId: string | null;
}

/** Company-level emissions of a supplier (CSRD style), from the rating partner. */
export interface CompanyEmissionsRecord {
  supplierId: string;
  reportingYear: number;
  scope12Tonnes: number | null;
  /** kg CO₂e per EUR of revenue. */
  intensityKgPerEur: number | null;
  renewableEnergyPercent: number | null;
  /** Average transport distance to the client's plant. */
  transportDistanceKm: number | null;
  /** Share of the requested sustainability data the supplier has provided. */
  dataCompletenessPercent: number | null;
  dataSource: string | null;
}

export type RiskSeverity = 'High' | 'Medium' | 'Low';

/** An alert of the risk-monitoring partner. Only derived from facts in the other systems; nothing new is invented. */
export interface RiskAlert {
  alertId: string;
  supplierId: string;
  date: string;
  severity: RiskSeverity;
  category: 'Legal violation' | 'Human rights' | 'Controversy' | 'Country risk' | 'Certificate' | 'Rating';
  title: string;
  detail: string;
}
