"use client";

import { Button, Card, Result } from "antd";
import type { DecisionRecord } from "@scc/shared";
import { formatNumber } from "@/lib/labels";

interface Props {
  record: DecisionRecord;
  supplierName: string;
  partName: string;
  onOpenDecision: () => void;
  onBackToQueue: () => void;
}

/** Step 5: the decision is in the Decision Log and the requisition leaves the work queue. */
export function CompleteStep({ record, supplierName, partName, onOpenDecision, onBackToQueue }: Props) {
  const avoided = record.vsCurrent?.co2TotalDeltaT != null ? -record.vsCurrent.co2TotalDeltaT : null;
  return (
    <Card className="dash-card process-card" size="small">
      <Result
        status="success"
        title={`${partName}: awarded to ${supplierName}`}
        subTitle={[
          `Recorded in the Decision Log by ${record.decidedBy?.name ?? "you"}`,
          record.followsRecommendation ? "follows the recommendation" : "differs from the recommendation, with justification",
          avoided !== null && avoided > 0 ? `${formatNumber(avoided, 1)} t CO₂e avoided against the current supplier` : null,
          `requisition ${record.requisitionId ?? ""} moved to Completed`,
        ]
          .filter(Boolean)
          .join(" · ")}
        extra={[
          <Button key="queue" type="primary" onClick={onBackToQueue}>
            Back to work queue
          </Button>,
          <Button key="log" onClick={onOpenDecision}>
            Open the record
          </Button>,
        ]}
      />
    </Card>
  );
}
