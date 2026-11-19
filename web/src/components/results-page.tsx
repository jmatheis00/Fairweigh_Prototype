"use client";

import { Tabs } from "antd";
import type { DecisionRecord, DemoSettings } from "@scc/shared";
import { ImpactPage } from "./impact-page";
import { PurchaseOverview } from "./purchase-overview";

interface Props {
  settings: DemoSettings;
  log: DecisionRecord[];
  supplierNames: Record<string, string>;
  onOpenDecision: (record: DecisionRecord) => void;
  onOpenSupplier: (supplierId: string) => void;
  /** Sarah gets one page instead of two tabs (decision 20 Nov 2026). */
  forSustainability?: boolean;
}

/**
 * Results and reports (expert interviews, 10 Nov 2026): the overall analyses live here,
 * apart from the individual purchase. Two tabs, so overview and single decisions are not mixed. The sustainability
 * manager gets one page with the CO₂ figures and the decisions, without the purchase order list (20 Nov 2026).
 */
export function ResultsPage({ forSustainability = false, ...props }: Props) {
  if (forSustainability) return <ImpactPage {...props} forSustainability />;
  return (
    <Tabs
      className="results-tabs"
      defaultActiveKey="decisions"
      items={[
        { key: "decisions", label: "Results of Fairweigh decisions", children: <ImpactPage {...props} /> },
        { key: "purchasing", label: "Purchasing report", children: <PurchaseOverview catalog={props.settings.catalog} /> },
      ]}
    />
  );
}
