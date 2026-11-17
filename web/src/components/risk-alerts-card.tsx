"use client";

import { Card, Segmented, Table, Typography } from "antd";
import { useState } from "react";
import { RISK_MONITORING, formatDay, type RiskSeverity } from "@scc/shared";
import { usePartnerData } from "@/lib/partner-data";
import { RiskLevelTag } from "./risk-level-tag";

/** Newest alerts of the risk-monitoring partner; filtered like the supplier lists. */
export function RiskAlertsCard({ supplierName, keep = () => true }: { supplierName: (id: string) => string; keep?: (id: string) => boolean }) {
  const { data } = usePartnerData();
  const [severity, setSeverity] = useState<"All" | RiskSeverity>("All");
  if (!data) return null;
  const alerts = data.alerts.filter((a) => keep(a.supplierId) && (severity === "All" || a.severity === severity));
  return (
    <Card
      className="dash-card"
      size="small"
      title={`Alerts · ${RISK_MONITORING.label} (${alerts.length})`}
      extra={
        <Segmented
          size="small"
          aria-label="Severity"
          value={severity}
          onChange={(v) => setSeverity(v as "All" | RiskSeverity)}
          options={["All", "High", "Medium", "Low"]}
        />
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table
        size="small"
        pagination={false}
        rowKey="alertId"
        dataSource={alerts}
        scroll={{ y: 220, x: 640 }}
        columns={[
          { title: "Date", key: "d", width: 110, render: (_, a) => formatDay(a.date) },
          { title: "Severity", key: "s", width: 110, render: (_, a) => <RiskLevelTag level={a.severity} /> },
          { title: "Supplier", key: "sup", width: 200, render: (_, a) => supplierName(a.supplierId) },
          { title: "Alert", key: "t", render: (_, a) => (
            <span>
              <strong>{a.title}</strong>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>{a.category} · {a.detail}</Typography.Text>
            </span>
          ) },
        ]}
      />
    </Card>
  );
}
