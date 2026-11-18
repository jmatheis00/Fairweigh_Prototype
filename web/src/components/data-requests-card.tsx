"use client";

import { MailOutlined } from "@ant-design/icons";
import { Button, Card, Table, Tag, Tooltip, Typography } from "antd";
import type { Co2DataQuality, ErpRecord, SupplierFlag } from "@scc/shared";
import { requestMailto, sustainabilityRequestText } from "@/lib/data-request";
import { usePartnerData } from "@/lib/partner-data";

const DEMO_DATE = "2026-11-06";

interface Row {
  supplierId: string;
  /** Lower = more urgent: 0 = in our purchases, 1 = current supplier, 2 = others. */
  priority: number;
  reasons: string[];
  items: string[];
}

interface Props {
  erp: ErpRecord[];
  dataQuality: Co2DataQuality[];
  dataGaps: { supplierId: string; missing: string[] }[];
  flagged: SupplierFlag[];
  name: (id: string) => string;
}

/**
 * Next steps for the Scope 3 manager: which supplier to ask for which data, from what the
 * connected systems are missing. Built in code; the request opens as an e-mail draft, never sent.
 */
export function DataRequestsCard({ erp, dataQuality, dataGaps, name }: Props) {
  const { data } = usePartnerData();
  const active = new Set(erp.filter((e) => e.relationshipStatus === "Active contract").map((e) => e.supplierId));
  const rows = new Map<string, Row>();
  const add = (supplierId: string, priority: number, reason: string, item: string) => {
    const row = rows.get(supplierId) ?? { supplierId, priority, reasons: [], items: [] };
    row.priority = Math.min(row.priority, priority);
    if (!row.reasons.includes(reason)) row.reasons.push(reason);
    if (!row.items.includes(item)) row.items.push(item);
    rows.set(supplierId, row);
  };

  // CO₂ values behind our purchases that are estimates or old.
  for (const d of dataQuality) {
    if (d.badge !== "Verified" && d.badge !== "Supplier-specific") {
      add(d.supplierId, 0, "CO₂ only estimated", "A product carbon footprint per piece (ISO 14067 or PACT), ideally third-party verified");
    }
    if (d.outdated) add(d.supplierId, 0, "CO₂ data outdated", "An updated product carbon footprint per piece");
  }
  // Current suppliers without sufficient sustainability data.
  for (const g of dataGaps.filter((x) => active.has(x.supplierId))) {
    for (const m of g.missing) {
      add(g.supplierId, 1, m === "sustainability rating" ? "No rating" : "No own CO₂ data",
        m === "sustainability rating" ? "Your current sustainability rating (e.g. scorecard)" : "Your company emissions (Scope 1–3) or product footprints");
    }
  }
  // Certificates of current suppliers that expire soon.
  for (const c of data?.certificates ?? []) {
    const days = (Date.parse(c.validUntil) - Date.parse(DEMO_DATE)) / 86_400_000;
    if (active.has(c.supplierId) && days <= 120) {
      add(c.supplierId, 1, `${c.standard} expires`, `The renewed ${c.standard} certificate (current one valid until ${c.validUntil})`);
    }
  }
  const list = [...rows.values()].sort((a, b) => a.priority - b.priority || b.items.length - a.items.length || a.supplierId.localeCompare(b.supplierId));

  return (
    <Card
      className="dash-card"
      size="small"
      title={
        <span>
          <MailOutlined /> Data to request ({list.length} suppliers)
        </span>
      }
      extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Suppliers in our purchases first · requests open as e-mail drafts</Typography.Text>}
      styles={{ body: { padding: 0 } }}
    >
      <Table<Row>
        size="small"
        pagination={false}
        rowKey="supplierId"
        dataSource={list}
        scroll={{ y: 220, x: 640 }}
        columns={[
          { title: "Supplier", key: "s", width: 220, render: (_, r) => (
            <span>
              {name(r.supplierId)}
              {r.priority === 0 && <Tag color="processing" style={{ marginInlineStart: 6 }}>in our purchases</Tag>}
            </span>
          ) },
          { title: "Why", key: "w", render: (_, r) => r.reasons.map((x) => <Tag key={x} color="warning" style={{ marginBottom: 2 }}>{x}</Tag>) },
          { title: "", key: "c", width: 200, align: "right", render: (_, r) => (
            <Tooltip title="Opens an e-mail draft in your mail program. Nothing is sent automatically.">
              <Button
                size="small"
                icon={<MailOutlined />}
                href={requestMailto(sustainabilityRequestText(name(r.supplierId), r.items))}
                aria-label={`Request data from ${name(r.supplierId)}`}
              >
                Request data ({r.items.length})
              </Button>
            </Tooltip>
          ) },
        ]}
      />
    </Card>
  );
}
