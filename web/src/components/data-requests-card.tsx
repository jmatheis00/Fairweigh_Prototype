"use client";

import { MailOutlined } from "@ant-design/icons";
import { Button, Card, Flex, Segmented, Table, Tag, Typography } from "antd";
import type { ReactNode } from "react";
import { formatDay, type Co2DataQuality, type DataLevel, type ErpRecord } from "@scc/shared";
import { requestMailto, sustainabilityRequestText } from "@/lib/data-request";
import { usePartnerData } from "@/lib/partner-data";
import { InfoTip } from "./info-tip";
import { DataLevelLabel, SupplierNameLink, relationshipLabel } from "@/lib/supplier-labels";

const DEMO_DATE = "2026-11-06";

interface Row {
  supplierId: string;
  level: DataLevel;
  /** Lower = more urgent: 0 = in our purchases, 1 = current supplier, 2 = others. */
  priority: number;
  /** Why the supplier is listed: short tags. */
  reasons: string[];
  /** What to ask the supplier for. */
  items: string[];
}

/** Worst data first (19 Nov 2026); "update" = data is there but outdated, only estimated or a certificate expires. */
export type SupplierDataView = "insufficient" | "partial" | "update";
type View = SupplierDataView;

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
  /** Opens the suppliers page with this data level as filter ("Show all in Suppliers"). */
  onShowAll?: (level: DataLevel) => void;
  /** The shown view; the page holds it, so a KPI tile can switch it (19 Nov 2026). */
  view: View;
  onViewChange: (view: View) => void;
  /** Period of the purchases behind "Needs update", e.g. "Q3 2026". */
  periodLabel: string;
}

/**
 * Supplier data (merged 19 Nov 2026 from "Data to request" and "CO₂ data per supplier"):
 * which supplier to ask for which data, and which suppliers have data gaps. Built in code from what
 * the connected systems are missing; a request opens as an e-mail draft, never sent.
 */
export function DataRequestsCard({ erp, dataQuality, dataGaps, name, onOpenSupplier, keep, relationshipFilter, onShowAll, view, onViewChange, periodLabel }: Props) {
  const { data } = usePartnerData();
  const active = new Set(erp.filter((e) => e.relationshipStatus === "Active contract").map((e) => e.supplierId));
  const levelOf = new Map(dataGaps.map((g) => [g.supplierId, g.level]));
  const rows = new Map<string, Row>();
  const row = (supplierId: string, priority: number) => {
    const r = rows.get(supplierId) ?? { supplierId, level: levelOf.get(supplierId) ?? "sufficient", priority, reasons: [], items: [] };
    r.priority = Math.min(r.priority, priority);
    rows.set(supplierId, r);
    return r;
  };
  const add = (supplierId: string, priority: number, reason: string, item: string) => {
    const r = row(supplierId, priority);
    if (!r.reasons.includes(reason)) r.reasons.push(reason);
    if (!r.items.includes(item)) r.items.push(item);
  };

  // CO₂ values behind our purchases that are estimates or old.
  for (const d of dataQuality) {
    if (d.badge !== "Verified" && d.badge !== "Supplier-specific") {
      add(d.supplierId, 0, "CO₂ only estimated", "A product carbon footprint per piece (ISO 14067 or PACT), ideally third-party verified");
    }
    if (d.outdated) add(d.supplierId, 0, `CO₂ outdated, as of ${formatDay(d.referenceDate)}`, "An updated product carbon footprint per piece");
  }
  // Data gaps: every supplier with a gap can be asked (19 Nov 2026). A missing value scores 0 points,
  // so a candidate without data can never lead; asking early gives it a fair chance. Current suppliers first.
  for (const g of dataGaps) {
    for (const m of g.missing) {
      const rating = m === "sustainability rating";
      add(
        g.supplierId,
        active.has(g.supplierId) ? 1 : 2,
        rating ? "No rating" : "No own CO₂ data",
        rating ? "Your current sustainability rating (e.g. scorecard)" : "Your company emissions (Scope 1–3) or product footprints",
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
    insufficient: all.filter((r) => r.level === "insufficient"),
    partial: all.filter((r) => r.level === "partial"),
    update: all.filter((r) => r.level === "sufficient"),
  };
  const shown = lists[view];
  const erpOf = (id: string) => erp.find((e) => e.supplierId === id);

  return (
    <Card
      className="dash-card"
      size="small"
      title="Supplier data, today"
      extra={
        <Flex gap={8} wrap justify="end">
          <Segmented<View>
            size="small"
            aria-label="Which suppliers"
            value={view}
            onChange={onViewChange}
            options={[
              { value: "insufficient", label: `Insufficient (${lists.insufficient.length})` },
              { value: "partial", label: `Partly (${lists.partial.length})` },
              { value: "update", label: `Needs update (${lists.update.length})` },
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
        locale={{ emptyText: view === "update" ? "No supplier data needs an update." : "No supplier at this level." }}
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
                  {r.priority === 0 ? `In our purchases, ${periodLabel}` : relationshipLabel(erpOf(r.supplierId)?.relationshipStatus)}
                </Typography.Text>
              </Flex>
            ),
          },
          {
            title: (
              <span>
                Data{" "}
                <InfoTip
                  label="data levels"
                  title="Sufficient = the supplier's own CO₂ data (report, self-assessment or PCF declaration) and a sustainability rating. Industry averages and web searches do not count."
                />
              </span>
            ),
            key: "lv",
            width: 115,
            render: (_, r) => <DataLevelLabel level={r.level} />,
          },
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
        Our own suppliers first · requests open as e-mail drafts
        {onShowAll && view !== "update" && (
          <>
            {" · "}
            <Button type="link" size="small" className="inline-link" style={{ fontSize: "inherit" }} onClick={() => onShowAll(view)}>
              Show all {view === "insufficient" ? "insufficient" : "partly"} in Suppliers
            </Button>
          </>
        )}
      </Typography.Text>
    </Card>
  );
}
