"use client";

import { CheckCircleOutlined } from "@ant-design/icons";
import { Card, Descriptions, Flex, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { formatDay, type PurchaseOrderRecord } from "@scc/shared";
import { DRAWER_WIDTH } from "@/lib/layout";
import { formatEur, formatNumber } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { PcfBadgeTag } from "./pcf-badge-tag";
import { PdfLink } from "./pdf-link";
import { SidePanel } from "./side-panel";

/** Exactly five one-line rows (35.5 px each), so no row is cut at rest and the rest scrolls. */
const ORDER_LIST_HEIGHT = 178;

interface Props {
  /** Orders of the chosen period and product, newest first. */
  orders: PurchaseOrderRecord[];
  periodLabel: string;
  name: (supplierId: string) => string;
  /** Short product name. */
  part: (partId: string) => string;
}

/**
 * The buyer's purchase orders on the Results page (20 Nov 2026): a five-row scrolling list that follows the
 * period and product filter; a click opens the ERP record with the order PDF in the side panel.
 */
export function PurchaseOrdersCard({ orders, periodLabel, name, part }: Props) {
  const [openPo, setOpenPo] = useState<PurchaseOrderRecord | null>(null);

  return (
    <>
      <Card
        className="dash-card"
        size="small"
        title={`Purchase orders, ${periodLabel} (${orders.length})`}
        extra={<Typography.Text type="secondary" style={{ fontSize: 12 }}>Click an order for its ERP record and PDF</Typography.Text>}
        styles={{ body: { padding: 0 } }}
      >
        <Table<PurchaseOrderRecord>
          size="small"
          pagination={false}
          rowKey="recordId"
          dataSource={orders}
          locale={{ emptyText: "No purchase orders in this period." }}
          scroll={{ y: ORDER_LIST_HEIGHT, x: 900 }}
          className="table-clickable"
          onRow={(o) => ({ onClick: () => setOpenPo(o) })}
          columns={[
            { title: "Date", key: "date", width: 110, render: (_, o) => formatDay(o.orderDate) },
            { title: "Order", key: "po", width: 130, render: (_, o) => <span style={{ whiteSpace: "nowrap" }}>{o.poNumber}</span> },
            { title: "Product", key: "part", ellipsis: true, render: (_, o) => part(o.partId) },
            { title: "Supplier", key: "supplier", ellipsis: true, render: (_, o) => shortName(name(o.supplierId)) },
            { title: "Quantity", key: "qty", align: "right", width: 100, render: (_, o) => `${formatNumber(o.quantity, 0)} pcs` },
            { title: "Value", key: "value", align: "right", width: 110, render: (_, o) => formatEur(o.unitPriceEur * o.quantity) },
            {
              title: "CO₂/piece",
              key: "pcf",
              align: "right",
              width: 140,
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
    </>
  );
}
