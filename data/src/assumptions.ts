import type { BuyerProfile, Co2Targets } from '@scc/shared';
import type { CatalogPart } from '@scc/shared';

/** Shape of data/assumptions.json: values that are not in the Excel. */
/** Offers, PCF values and prices for one part. */
export interface PartAssumptions {
  partId: string;
  /** Offers and PCF records come from the Excel v2 demo case sheets instead of "offers"/"pcf" below. */
  fromExcelV2?: boolean;
  partName: string;
  /** Commodity group; its average CO2 intensity is used for estimated PCF values. */
  category: string;
  /** Default quantity in the request form and on the offer. */
  quantity: number;
  /** Supplier of this part today (simulated ERP source list). */
  currentSupplierId: string;
  basePriceEurAtIndex100: { value: number; toConfirm: boolean; reason: string };
  pcfEstimate: { referenceKgPerPiece: number; toConfirm: boolean; reason: string };
  /** CO₂ benchmark: a published factor per kg of material (data/source/public-benchmarks.json) × material per piece. */
  co2Benchmark?: { factorId: string; materialKgPerPiece: number; toConfirm: boolean; reason: string };
  offers: Record<
    string,
    { priceDate: string; validUntil: string; priceType: 'firm' | 'indicative'; toConfirm: boolean; reason?: string }
  >;
  pcf: Record<
    string,
    | { badge: 'actual'; pcfKgPerPiece: number; method: string; toConfirm: boolean }
    | { badge: 'estimated'; toConfirm: boolean }
  >;
}

export interface Assumptions {
  notice: string;
  demoSupplierIds: string[];
  /** New fictitious suppliers, with the same columns as the Excel. Dates as YYYY-MM-DD. */
  extraSuppliers: { toConfirm: boolean; reason: string; rows: Record<string, unknown>[] };
  /** Changed Excel values per supplier: column name -> new value. */
  overrides: Record<string, { values: Record<string, unknown>; reason: string; toConfirm?: boolean }>;
  /** Parts with offers in the demo (three since 6 Nov 2026). */
  parts: PartAssumptions[];
  /** Product list of the request form; hasOffers, quantity and current supplier come from "parts". */
  catalog: Pick<CatalogPart, 'partId' | 'partName' | 'category' | 'hasOffers'>[];
  co2PricePerTonneEur: { value: number; toConfirm: boolean; reason: string };
  priceMaxAgeDays: { value: number; toConfirm: boolean; reason: string };
  co2MaxAgeDays: { value: number; toConfirm: boolean; reason: string };
  /** Buyers and their commodity groups (fictitious, 10 Nov 2026). */
  buyers?: { toConfirm: boolean; reason: string; list: BuyerProfile[] };
  /** Default CO₂ saving targets for this year in t CO₂e (fictitious, 10 Nov 2026). */
  co2Targets?: { toConfirm: boolean; reason: string } & Co2Targets;
  /** Fictitious purchase orders (simulated ERP) for the start-page statistics. */
  purchaseHistory?: {
    toConfirm: boolean;
    reason: string;
    orders: {
      poNumber: string;
      orderDate: string;
      partId: string;
      supplierId: string;
      quantity: number;
      cockpitDecisionId: string | null;
      replacedSupplierId?: string;
    }[];
  };
  /** Example decisions for the decision log, matching the purchase history. */
  exampleDecisions?: {
    toConfirm: boolean;
    reason: string;
    decisions: {
      decisionId: string;
      partId: string;
      recordedAt: string;
      quantity: number;
      weights: { quality: number; price: number; co2: number; delivery: number };
      chosenSupplierId: string;
      /** The supplier this decision replaced; the reason is generated from both records. */
      replacedSupplierId: string;
      /** Closed requisition in the client ERP that this decision answered (sample work, 16 Nov 2026). */
      requisitionId?: string;
      reason: string;
      decidedBy: { name: string; role: string };
    }[];
  };
  fineNotices: Record<
    string,
    { issuedOn: string; authority: string; decision: string; status: string; toConfirm: boolean; reason: string }
  >;
}
