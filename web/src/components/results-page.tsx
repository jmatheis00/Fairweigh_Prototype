"use client";

import type { DecisionRecord, DemoSettings } from "@scc/shared";
import { ImpactPage } from "./impact-page";

interface Props {
  settings: DemoSettings;
  log: DecisionRecord[];
  supplierNames: Record<string, string>;
  onOpenDecision: (record: DecisionRecord) => void;
  onOpenSupplier: (supplierId: string) => void;
  /** The sustainability manager sees the share of supplier-specific CO₂ data instead of spend, and no order list. */
  forSustainability?: boolean;
}

/**
 * Results and reports (expert interviews, 10 Nov 2026): the overall analyses live here, apart from the individual
 * purchase. One page for every role since 20 Nov 2026 (before: two tabs for the category manager): purchased CO₂
 * against the target path, the next best actions and the decisions; the buyer also sees the purchase orders.
 */
export function ResultsPage(props: Props) {
  return <ImpactPage {...props} />;
}
