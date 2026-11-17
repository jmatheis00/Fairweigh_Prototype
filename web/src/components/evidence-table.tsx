"use client";

import { Button, Table, Typography } from "antd";
import type { AgentRun, Evidence, EvidenceTopic } from "@scc/shared";
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
}

export function EvidenceTable({ run, supplierNames, selectedId, onOpen }: Props) {
  return (
    <Table<Row>
      size="small"
      pagination={false}
      // Fixed column widths, so status tags never run into the next column; the table scrolls when narrow.
      tableLayout="fixed"
      scroll={{ x: 900 }}
      dataSource={buildRows(run)}
      rowClassName={(row) => (row.evidence && row.evidence.evidenceId === selectedId ? "row-selected" : row.evidence ? "row-clickable" : "")}
      onRow={(row) => ({ onClick: () => row.evidence && onOpen(row.evidence) })}
      columns={[
        {
          title: "Supplier",
          dataIndex: "supplierId",
          width: 180,
          render: (id: string) => (
            <>
              {supplierNames[id] ?? id} <Typography.Text type="secondary">{id}</Typography.Text>
            </>
          ),
        },
        { title: "Criterion", dataIndex: "topic", width: 120, render: (t: EvidenceTopic) => TOPIC_LABEL[t] },
        {
          title: "Value",
          align: "right",
          width: 120,
          render: (_, row) => (row.evidence ? formatValue(row.evidence) : <Typography.Text type="secondary">—</Typography.Text>),
        },
        {
          title: "Status",
          width: 190,
          render: (_, row) => <StatusTag status={row.evidence ? row.evidence.status : "missing"} />,
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
