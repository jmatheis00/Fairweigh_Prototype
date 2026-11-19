"use client";

import { CheckCircleOutlined, CloseCircleOutlined, MailOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { Button, Card, Flex, Segmented, Table, Tag, Typography } from "antd";
import { useState, type ReactNode } from "react";
import { formatDay, type Co2DataQuality, type DataLevel, type ErpRecord } from "@scc/shared";
import { requestMailto, sustainabilityRequestText } from "@/lib/data-request";
import { usePartnerData } from "@/lib/partner-data";
import { SupplierNameLink, relationshipLabel } from "@/lib/supplier-labels";

const DEMO_DATE = "2026-11-06";

/** Data level as icon plus word (never colour alone). */
export function DataLevelLabel({ level }: { level: DataLevel }) {
  if (level === "sufficient") return <span className="tone-good"><CheckCircleOutlined /> Sufficient</span>;
  if (level === "partial") return <span className="tone-warn"><MinusCircleOutlined /> Partly</span>;
  return <span className="tone-bad"><CloseCircleOutlined /> Insufficient</span>;
}

interface Row {
  supplierId: string;
  level: DataLevel;
  /** Lower = more urgent: 0 = in our purchases, 1 = current supplier, 2 = others. */
  priority: number;
  /** Why the supplier is listed: short tags. */
  reasons: string[];
  /** What to ask the supplier for; empty = nothing to request (e.g. a candidate). */
  items: string[];
}

type View = "request" | "insufficient" | "partial";

interface Props {
  erp: ErpRecord[];
  dataQuality: Co2DataQuality[];
  dataGaps: { supplierId: string; level: DataLevel; missing: string[] }[];
  name: (id: string) => string;
  /** Opens the supplier side panel. */
  onOpenSupplier?: (supplierId: string) => void;
  /** Relationship filter of the page: keeps a supplier or not. */
  keep: (supplierId: string) => boolean;
  /** The relationship select, shown in the card header. */
  relationshipFilter: ReactNode;
}

/**
 * Supplier data (merged 19 Nov 2026 from "Data to request" and "CO₂ data per supplier"):
 * which supplier to ask for which data, and which suppliers have data gaps. Built in code from what
 * the connected systems are missing; a request opens as an e-mail draft, never sent.
 */
export function DataRequestsCard({ erp, dataQuality, dataGaps, name, onOpenSupplier, keep, relationshipFilter }: Props) {
  const { data } = usePartnerData();
  const [view, setView] = useState<View>("request");
  const active = new Set(erp.filter((e) => e.relationshipStatus === "Active contract").map((e) => e.supplierId));
  const levelOf = new Map(dataGaps.map((g) => [g.supplierId, g.level]));
  const rows = new Map<string, Row>();
  const row = (supplierId: string, priority: number) => {
    const r = rows.get(supplierId) ?? { supplierId, level: levelOf.get(supplierId) ?? "sufficient", priority, reasons: [], items: [] };
    r.priority = Math.min(r.priority, priority);
    rows.set(supplierId, r);
    return r;
  };
  const add = (supplierId: string, priority: number, reason: string, item: string | null) => {
    const r = row(supplierId, priority);
    if (!r.reasons.includes(reason)) r.reasons.push(reason);
    if (item && !r.items.includes(item)) r.items.push(item);
  };

  // CO₂ values behind our purchases that are estimates or old.
  for (const d of dataQuality) {
    if (d.badge !== "Verified" && d.badge !== "Supplier-specific") {
      add(d.supplierId, 0, "CO₂ only estimated", "A product carbon footprint per piece (ISO 14067 or PACT), ideally third-party verified");
    }
    if (d.outdated) add(d.supplierId, 0, `CO₂ outdated, as of ${formatDay(d.referenceDate)}`, "An updated product carbon footprint per piece");
  }
  // Data gaps: current suppliers get a request, the others are listed so Sarah sees the gap.
  for (const g of dataGaps) {
    const current = active.has(g.supplierId);
    for (const m of g.missing) {
      const rating = m === "sustainability rating";
      add(
        g.supplierId,
        current ? 1 : 2,
        rating ? "No rating" : "No own CO₂ data",
        current ? (rating ? "Your current sustainability rating (e.g. scorecard)" : "Your company emissions (Scope 1–3) or product footprints") : null,
      );
    }
  }
  // Certificates of current suppliers that expire soon.
  for (const c of data?.certificates ?? []) {
    const days = (Date.parse(c.validUntil) - Date.parse(DEMO_DATE)) / 86_400_000;
    if (active.has(c.supplierId) && days <= 120) {
      add(c.supplierId, 1, `${c.standard} expires`, `The renewed ${c.standard} certificate (current one valid until ${c.validUntil})`);
    }
  }

  const all = [...rows.values()]
    .filter((r) => keep(r.supplierId))
    .sort((a, b) => a.priority - b.priority || b.items.length - a.items.length || a.supplierId.localeCompare(b.supplierId));
  const lists: Record<View, Row[]> = {
    request: all.filter((r) => r.items.length > 0),
    insufficient: all.filter((r) => r.level === "insufficient"),
    partial: all.filter((r) => r.level === "partial"),
  };
  const shown = lists[view];
  const erpOf = (id: string) => erp.find((e) => e.supplierId === id);

  return (
    <Card
      className="dash-card"
      size="small"
      title="Supplier data"
      extra={
        <Flex gap={8} wrap justify="end">
          <Segmented<View>
            size="small"
            aria-label="Which suppliers"
            value={view}
            onChange={setView}
            options={[
              { value: "request", label: `To request (${lists.request.length})` },
              { value: "insufficient", label: `Insufficient (${lists.insufficient.length})` },
              { value: "partial", label: `Partly (${lists.partial.length})` },
            ]}
          />
          {relationshipFilter}
        </Flex>
      }
      styles={{ body: { padding: 0 } }}
    >
      <Table<Row>
        size="small"
        pagination={false}
        rowKey="supplierId"
        dataSource={shown}
        locale={{ emptyText: view === "request" ? "Nothing to request." : "No supplier at this level." }}
        scroll={{ y: 220, x: 620 }}
        columns={[
          {
            title: "Supplier",
            key: "s",
            width: 190,
            render: (_, r) => (
              <Flex vertical align="start">
                <SupplierNameLink supplierId={r.supplierId} name={name(r.supplierId)} onOpen={onOpenSupplier} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.priority === 0 ? "In our purchases" : relationshipLabel(erpOf(r.supplierId)?.relationshipStatus)}
                </Typography.Text>
              </Flex>
            ),
          },
          { title: "Data", key: "lv", width: 115, render: (_, r) => <DataLevelLabel level={r.level} /> },
          {
            title: "Why",
            key: "w",
            render: (_, r) =>
              r.reasons.length ? (
                <Flex wrap gap={4}>
                  {r.reasons.map((x) => (
                    <Tag key={x} color="warning" style={{ marginInlineEnd: 0 }}>
                      {x}
                    </Tag>
                  ))}
                </Flex>
              ) : (
                "—"
              ),
          },
          {
            title: "",
            key: "c",
            width: 150,
            align: "right",
            render: (_, r) =>
              r.items.length ? (
                <Button
                  size="small"
                  icon={<MailOutlined />}
                  href={requestMailto(sustainabilityRequestText(name(r.supplierId), r.items))}
                  aria-label={`Request data from ${name(r.supplierId)}`}
                >
                  Request ({r.items.length})
                </Button>
              ) : null,
          },
        ]}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", padding: "6px 12px 10px" }}>
        Requests go to suppliers in our purchases and current suppliers and open as e-mail drafts. Sufficient = CO₂ data from the
        supplier (report, self-assessment or PCF declaration) and a sustainability rating; industry averages and web searches do not
        count. CO₂ values per product are in the supplier panel.
      </Typography.Text>
    </Card>
  );
}
