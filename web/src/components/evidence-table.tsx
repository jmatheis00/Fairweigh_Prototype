"use client";

import { MailOutlined, StopOutlined } from "@ant-design/icons";
import { Button, Flex, Table, Typography } from "antd";
import { CRITERIA, type AgentRun, type DecisionResult, type Evidence, type EvidenceTopic } from "@scc/shared";
import { dataRequestText, offerDataRequest, requestItems, requestMailto } from "@/lib/data-request";
import { SYSTEM_LABEL, TOPIC_LABEL, TOPIC_ORDER, formatNumber, displayUnit } from "@/lib/labels";
import { StatusTag } from "./status-tag";

interface Row {
  key: string;
  supplierId: string;
  topic: EvidenceTopic;
  evidence: Evidence | null;
  gapReason: string | null;
}

/** One row per supplier and criterion; gaps show "Data missing". */
export function buildRows(run: AgentRun): Row[] {
  const rows: Row[] = [];
  for (const supplierId of run.request.supplierIds) {
    for (const topic of TOPIC_ORDER) {
      const pieces = run.evidence.filter((e) => e.supplierId === supplierId && e.topic === topic);
      const gap = run.gaps.find((g) => g.supplierId === supplierId && g.topic === topic);
      // Compliance only appears when something was found.
      if (topic === "compliance" && pieces.length === 0) continue;
      if (pieces.length === 0) {
        rows.push({ key: `${supplierId}-${topic}`, supplierId, topic, evidence: null, gapReason: gap?.reason ?? "Not reported by the agent" });
      }
      for (const evidence of pieces) {
        rows.push({ key: evidence.evidenceId, supplierId, topic, evidence, gapReason: null });
      }
    }
  }
  return rows;
}

export function formatValue(e: Evidence): string {
  if (typeof e.value === "string") return e.value;
  const decimals = e.topic === "price" ? 2 : Number.isInteger(e.value) ? 0 : 1;
  return `${formatNumber(e.value, decimals)} ${displayUnit(e.unit)}`;
}

function sourceText(e: Evidence): string {
  const where = e.location.kind === "field" ? `field ${e.location.field}` : `page ${e.location.page}`;
  return `${SYSTEM_LABEL[e.system]} · ${e.recordId} · ${where}`;
}

interface Props {
  run: AgentRun;
  supplierNames: Record<string, string>;
  selectedId: string | null;
  onOpen: (evidence: Evidence) => void;
  /** With the result and part name, each supplier with gaps gets a "Request missing data" e-mail draft. */
  result?: DecisionResult | null;
  partName?: string;
  /** Suppliers that never delivered: they are asked for a sample delivery instead of quality and delivery figures. */
  neverDelivered?: Set<string>;
}

/**
 * One table per supplier (19 Nov 2026), so the offers are clearly apart; the header of each says how many of
 * the four criteria are verified and, when something is missing or only estimated, offers the same data request
 * as "What's missing to decide" (an e-mail draft, nothing is sent). Excluded offers get no request.
 */
export function EvidenceTable({ run, supplierNames, selectedId, onOpen, result = null, partName, neverDelivered }: Props) {
  const rows = buildRows(run);
  return (
    <Flex vertical gap={24}>
      {run.request.supplierIds.map((id) => {
        const name = supplierNames[id] ?? id;
        const own = rows.filter((r) => r.supplierId === id);
        const ranked = result?.ranked.find((r) => r.supplierId === id) ?? null;
        const excluded = result?.excluded.some((x) => x.supplierId === id) ?? false;
        // Excluded offers only get a request when a document can lift the knock-out (LkSG: an SA8000 audit).
        const lksgExcluded = result?.excluded.some((x) => x.supplierId === id && x.knockOut.reason.startsWith("LkSG")) ?? false;
        const request =
          result && partName && (!excluded || lksgExcluded) ? offerDataRequest(run, result, id, name, partName, neverDelivered?.has(id) ?? false) : null;
        const asks = request ? requestItems(request).length : 0;
        return (
          <section key={id} aria-label={`Evidence of ${name}`}>
            <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 8 }}>
              <div>
                <Typography.Text strong style={{ fontSize: 15 }}>
                  {name}
                </Typography.Text>{" "}
                <Typography.Text type="secondary">{id}</Typography.Text>
                {excluded ? (
                  <Typography.Text style={{ fontSize: 12, color: "var(--bad)", marginInlineStart: 8 }}>
                    <StopOutlined aria-hidden /> Excluded
                  </Typography.Text>
                ) : ranked ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12, marginInlineStart: 8 }}>
                    {ranked.verifiedCount} of {CRITERIA.length} criteria verified
                  </Typography.Text>
                ) : null}
              </div>
              {request && asks > 0 && (
                <Button size="small" icon={<MailOutlined />} href={requestMailto(dataRequestText(request))} aria-label={`Request missing data from ${name}`}>
                  {lksgExcluded ? "Request SA8000 audit" : "Request missing data"}
                </Button>
              )}
            </Flex>
            <SupplierTable
              rows={own}
              selectedId={selectedId}
              onOpen={onOpen}
              gapStatus={(topic) => gapStatus(topic, ranked?.assumed ?? [], excluded && (neverDelivered?.has(id) ?? false))}
            />
          </section>
        );
      })}
    </Flex>
  );
}

type GapStatus = "missing" | "range" | "no_deliveries";

/**
 * What a gap means for the score (20 Nov 2026): a supplier that never delivered gets a range for quality and
 * delivery instead of 0 points, as in the offer table; for an excluded offer it is only "No deliveries".
 */
function gapStatus(topic: EvidenceTopic, assumed: readonly string[], excludedWithoutDeliveries: boolean): GapStatus {
  if (assumed.includes(topic)) return "range";
  if (excludedWithoutDeliveries && (topic === "quality" || topic === "delivery")) return "no_deliveries";
  return "missing";
}

function SupplierTable({
  rows,
  selectedId,
  onOpen,
  gapStatus: statusOfGap,
}: {
  rows: Row[];
  selectedId: string | null;
  onOpen: (evidence: Evidence) => void;
  gapStatus: (topic: EvidenceTopic) => GapStatus;
}) {
  return (
    <Table<Row>
      size="small"
      pagination={false}
      // Fixed column widths, so status tags never run into the next column and the tables line up; scrolls when narrow.
      tableLayout="fixed"
      scroll={{ x: 760 }}
      dataSource={rows}
      rowClassName={(row) => (row.evidence && row.evidence.evidenceId === selectedId ? "row-selected" : row.evidence ? "row-clickable" : "")}
      onRow={(row) => ({ onClick: () => row.evidence && onOpen(row.evidence) })}
      columns={[
        { title: "Criterion", dataIndex: "topic", width: 140, render: (t: EvidenceTopic) => TOPIC_LABEL[t] },
        {
          title: "Value",
          align: "right",
          width: 150,
          render: (_, row) => (row.evidence ? formatValue(row.evidence) : <Typography.Text type="secondary">—</Typography.Text>),
        },
        {
          title: "Status",
          width: 170,
          render: (_, row) => <StatusTag status={row.evidence ? row.evidence.status : statusOfGap(row.topic)} />,
        },
        {
          title: "Source or reason",
          render: (_, row) => {
            const text = row.evidence ? sourceText(row.evidence) : (row.gapReason ?? "");
            return (
              <Typography.Text type="secondary" ellipsis={{ tooltip: text }} style={{ display: "block" }}>
                {text}
              </Typography.Text>
            );
          },
        },
        {
          title: "",
          align: "right",
          width: 120,
          render: (_, row) =>
            row.evidence ? (
              <Button
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(row.evidence!);
                }} aria-label={`Show source for ${TOPIC_LABEL[row.topic]}`}>
                Show source
              </Button>
            ) : null,
        },
      ]}
    />
  );
}
