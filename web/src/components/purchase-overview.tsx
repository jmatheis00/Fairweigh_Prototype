"use client";

import { ArrowDownOutlined, ArrowUpOutlined, CheckCircleOutlined, CloudOutlined, EuroOutlined, FallOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { Alert, Card, Descriptions, Flex, Table, Tag, Typography } from "antd";
import { SidePanel } from "./side-panel";
import { useEffect, useMemo, useState } from "react";
import {
  formatDay,
  purchaseStats,
  quarterOf,
  type CatalogPart,
  type PurchaseOrderRecord,
} from "@scc/shared";
import { api } from "@/lib/api";
import { DRAWER_WIDTH } from "@/lib/layout";
import { formatNumber, formatEur } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { Co2MonthChart, PART_ORDER } from "./co2-month-chart";
import { PcfBadgeTag } from "./pcf-badge-tag";
import { PageHeader } from "./page-header";
import { Sparkline } from "./analytics-charts";
import { PdfLink } from "./pdf-link";

const quarterLabel = (q: string) => `${q.slice(5)} ${q.slice(0, 4)}`;

/** A change with sign, unit and a word, so it never depends on colour. */
function Change({ value, lowerIsGood, unit = " %" }: { value: number | null; lowerIsGood: boolean; unit?: string }) {
  if (value === null) return <>no previous quarter</>;
  const good = lowerIsGood ? value < 0 : value > 0;
  const word = value === 0 ? "unchanged" : value < 0 ? "lower" : "higher";
  return (
    <span className={value === 0 ? "delta-same" : good ? "delta-better" : "delta-worse"}>
      {value < 0 ? <ArrowDownOutlined /> : value > 0 ? <ArrowUpOutlined /> : null} {value > 0 ? "+" : value < 0 ? "-" : "±"}
      {formatNumber(Math.abs(value), 1)}
      {unit} · {word}
    </span>
  );
}

/** Start page: what the client bought last quarter and how much CO₂e the Fairweigh decisions saved. */
export function PurchaseOverview({ catalog }: { catalog: CatalogPart[] }) {
  const [orders, setOrders] = useState<PurchaseOrderRecord[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [openPo, setOpenPo] = useState<PurchaseOrderRecord | null>(null);

  useEffect(() => {
    Promise.all([api.purchaseOrders(), api.erpList()])
      .then(([o, erp]) => {
        setOrders(o);
        setNames(Object.fromEntries(erp.map((e) => [e.supplierId, e.supplierName])));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const stats = useMemo(() => (orders ? purchaseStats(orders) : null), [orders]);
  // Products in catalog order: colour follows the product.
  const parts = useMemo(
    () =>
      catalog
        .filter((p) => orders?.some((o) => o.partId === p.partId))
        .sort((a, b) => PART_ORDER.indexOf(a.partId) - PART_ORDER.indexOf(b.partId))
        .map((p) => ({ partId: p.partId, label: p.partName.split(",")[0]!.replace("Enamelled copper magnet wire", "Copper magnet wire") })),
    [catalog, orders],
  );
  const name = (id: string) => names[id] ?? id;
  const partLabel = (id: string) => parts.find((p) => p.partId === id)?.label ?? id;

  if (error) return <Alert type="error" showIcon title={`Purchase history not available: ${error}`} />;
  if (!orders || !stats) return null;

  const current = orders.filter((o) => quarterOf(o.orderDate) === stats.current.quarter).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const decided = [...new Map(current.filter((o) => o.cockpitDecisionId).map((o) => [o.cockpitDecisionId, o])).values()];
  const decisionMonth = orders
    .filter((o) => o.cockpitDecisionId)
    .map((o) => o.orderDate.slice(0, 7))
    .sort()[0] ?? null;
  const prev = quarterLabel(stats.previous.quarter);
  // Monthly series over the whole history in the client ERP, for the sparklines.
  const monthly = [...new Set(orders.map((o) => o.orderDate.slice(0, 7)))].sort().map((m) => {
    const inMonth = orders.filter((o) => o.orderDate.startsWith(m));
    return {
      co2: inMonth.reduce((a, o) => a + (o.pcfKgPerPiece * o.quantity) / 1000, 0),
      spend: inMonth.reduce((a, o) => a + o.unitPriceEur * o.quantity, 0),
    };
  });

  return (
    <Flex vertical gap={12} style={{ minWidth: 0 }}>
      <PageHeader
        title={`Your purchasing in ${quarterLabel(stats.current.quarter)}`}
        subtitle="What you bought last quarter, how much CO₂ it caused, and what the decisions in Fairweigh changed."
        source="Source: purchase orders in the client ERP"
      />

      <div className="kpi-grid kpi-grid-4">
        <Card className="dash-card" size="small">
          <Flex justify="space-between" align="flex-start" gap={8}>
            <div>
              <div className="kpi-label"><CloudOutlined /> CO₂e purchased</div>
              <div className="kpi-value">{formatNumber(stats.current.co2Tonnes, 1)} t</div>
            </div>
            <Sparkline values={monthly.map((m) => m.co2)} label="CO₂e purchased per month since January 2025" />
          </Flex>
          <div className="kpi-sub">
            <Change value={stats.co2ChangePercent} lowerIsGood /> vs {prev} ({formatNumber(stats.previous.co2Tonnes, 1)} t)
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <div className="kpi-label"><FallOutlined /> Avoided by Fairweigh decisions</div>
          <div className="kpi-value">{formatNumber(stats.avoidedTonnes, 1)} t CO₂e</div>
          <div className="kpi-sub">
            {stats.cockpitDecisions} {stats.cockpitDecisions === 1 ? "decision" : "decisions"}: {decided.map((o) => partLabel(o.partId).toLowerCase()).join(", ")}
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <div className="kpi-label"><SafetyCertificateOutlined /> Spend with supplier-specific CO₂ data</div>
          <div className="kpi-value">{stats.current.actualPcfSharePercent === null ? "—" : `${formatNumber(stats.current.actualPcfSharePercent, 0)} %`}</div>
          <div className="kpi-sub">
            {stats.previous.actualPcfSharePercent === null ? "" : `${prev}: ${formatNumber(stats.previous.actualPcfSharePercent, 0)} % · rest estimated or industry average`}
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <Flex justify="space-between" align="flex-start" gap={8}>
            <div>
              <div className="kpi-label"><EuroOutlined /> Spend</div>
              <div className="kpi-value">{formatNumber(stats.current.spendEur / 1000, 0)}k €</div>
            </div>
            <Sparkline values={monthly.map((m) => m.spend)} label="Spend per month since January 2025" />
          </Flex>
          <div className="kpi-sub">
            <Change value={stats.spendChangePercent} lowerIsGood /> vs {prev}
          </div>
        </Card>
      </div>

      <Card className="dash-card" size="small" title={`CO₂e purchased per month in t, ${prev} and ${quarterLabel(stats.current.quarter)}`}>
        <Co2MonthChart stats={stats} parts={parts} decisionMonth={decisionMonth} />
      </Card>

      <Card
        className="dash-card"
        size="small"
        title={`Purchase orders ${quarterLabel(stats.current.quarter)} (${current.length})`}
        extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Click an order for its ERP record</Typography.Text>}
        styles={{ body: { padding: 0 } }}
      >
        <Table<PurchaseOrderRecord>
          size="small"
          pagination={false}
          rowKey="recordId"
          dataSource={current}
          scroll={{ y: 230, x: 760 }}
          className="table-clickable"
          onRow={(o) => ({ onClick: () => setOpenPo(o) })}
          columns={[
            { title: "Date", key: "date", width: 100, render: (_, o) => formatDay(o.orderDate) },
            { title: "Product", key: "part", render: (_, o) => partLabel(o.partId) },
            { title: "Supplier", key: "supplier", render: (_, o) => shortName(name(o.supplierId)) },
            { title: "Quantity", key: "qty", align: "right", width: 90, render: (_, o) => `${formatNumber(o.quantity, 0)} pcs` },
            {
              title: "CO₂/piece",
              key: "pcf",
              align: "right",
              width: 130,
              render: (_, o) => (
                <span style={{ whiteSpace: "nowrap" }}>
                  {formatNumber(o.pcfKgPerPiece, 1)} kg <PcfBadgeTag badge={o.pcfBadge} />
                </span>
              ),
            },
            { title: "CO₂e", key: "t", align: "right", width: 80, render: (_, o) => `${formatNumber((o.pcfKgPerPiece * o.quantity) / 1000, 1)} t` },
            {
              title: "Decision",
              key: "dec",
              width: 140,
              render: (_, o) =>
                o.cockpitDecisionId ? (
                  <Tag icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>
                    Via Fairweigh
                  </Tag>
                ) : (
                  <Typography.Text type="secondary">Existing contract</Typography.Text>
                ),
            },
          ]}
        />
      </Card>

      <SidePanel open={openPo !== null} contentKey={openPo?.poNumber} onClose={() => setOpenPo(null)} size={DRAWER_WIDTH} title={openPo ? `Purchase order ${openPo.poNumber}` : ""}>
        {openPo && (
          <Flex vertical gap={12}>
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                { label: "Order date", children: formatDay(openPo.orderDate) },
                { label: "Product", children: `${openPo.partName} (${openPo.partId})` },
                { label: "Supplier", children: `${name(openPo.supplierId)} (${openPo.supplierId})` },
                { label: "Quantity", children: `${formatNumber(openPo.quantity, 0)} pcs` },
                { label: "Unit price", children: formatEur(openPo.unitPriceEur, 2) },
                { label: "Order value", children: formatEur(openPo.unitPriceEur * openPo.quantity, 2) },
                { label: "CO₂ per piece", children: `${formatNumber(openPo.pcfKgPerPiece, 1)} kg CO₂e (${openPo.pcfBadge}) · ${openPo.pcfRecordId}` },
                { label: "CO₂e of the order", children: `${formatNumber((openPo.pcfKgPerPiece * openPo.quantity) / 1000, 2)} t` },
                {
                  label: "Fairweigh decision",
                  children: openPo.cockpitDecisionId
                    ? `${openPo.cockpitDecisionId}${openPo.replacedSupplierId ? `, replaced ${name(openPo.replacedSupplierId)} (${formatNumber(openPo.replacedPcfKgPerPiece ?? 0, 1)} kg/piece)` : ""}`
                    : "None (existing contract)",
                },
                ...(openPo.replacedPcfKgPerPiece !== null
                  ? [
                      {
                        label: "CO₂e avoided",
                        children: `${formatNumber(((openPo.replacedPcfKgPerPiece - openPo.pcfKgPerPiece) * openPo.quantity) / 1000, 2)} t = (${formatNumber(openPo.replacedPcfKgPerPiece, 1)} kg - ${formatNumber(openPo.pcfKgPerPiece, 1)} kg) × ${formatNumber(openPo.quantity, 0)} pcs`,
                      },
                    ]
                  : []),
                { label: "Order PDF", children: openPo.documentId ? <PdfLink documentId={openPo.documentId} label={`Open ${openPo.poNumber} (PDF)`} /> : "None" },
                { label: "Source", children: `Client ERP · ${openPo.poNumber}` },
              ]}
            />
          </Flex>
        )}
      </SidePanel>
    </Flex>
  );
}
