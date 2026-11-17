"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, Collapse, Descriptions, Empty, Flex, Table, Tag, Typography } from "antd";
import { CRITERIA, decisionsToCsv, formatDay, type Criterion, type DecisionRecord } from "@scc/shared";
import { STATIC_PREVIEW } from "@/lib/api";
import { downloadCsv } from "@/lib/decision-log";
import { TOPIC_LABEL, formatDateTime, formatNumber, displayUnit, formatSignedEur } from "@/lib/labels";

interface Props {
  records: DecisionRecord[];
  supplierNames: Record<string, string>;
  partNames: Record<string, string>;
  storageAvailable: boolean;
  /** Record to show expanded, e.g. when opened from the work queue or the results. */
  openRecordId?: string | null;
  onOpenSupplier?: (supplierId: string) => void;
  /** Starts a new purchase process for the same product and supplier; only for the buyer. */
}

const signedEur = (n: number) => formatSignedEur(n, 0);

/** The decision log: every recorded decision with its reason and weights; CSV export. */
export function DecisionLog({ records, supplierNames, partNames, storageAvailable, openRecordId, onOpenSupplier }: Props) {
  const name = (id: string) => supplierNames[id] ?? id;
  const supplier = (id: string) =>
    onOpenSupplier ? (
      <Button type="link" size="small" className="inline-link" style={{ fontSize: "inherit" }} onClick={() => onOpenSupplier(id)}>
        {name(id)}
      </Button>
    ) : (
      name(id)
    );
  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center" gap={8} wrap>
        <Typography.Text type="secondary">
          {STATIC_PREVIEW ? "New decisions are saved in this browser." : "New decisions are saved for the whole team."} Entries marked
          &quot;Example&quot; were recorded before.
        </Typography.Text>
        <Button
          className="decision-export"
          icon={<DownloadOutlined />}
          disabled={records.length === 0}
          onClick={() => downloadCsv(decisionsToCsv(records, name), `decision-log-${new Date().toISOString().slice(0, 10)}.csv`)}
        >
          Export CSV
        </Button>
      </Flex>
      {!storageAvailable && (
        <Typography.Text type="warning">
          {STATIC_PREVIEW ? "This browser does not allow saving." : "The Decision Log could not be saved or loaded."} New decisions stay
          only until the page is reloaded.
        </Typography.Text>
      )}
      {records.length === 0 ? (
        <Empty description="No decisions recorded yet." />
      ) : (
        <Collapse
          size="small"
          defaultActiveKey={openRecordId ? [openRecordId] : undefined}
          items={[...records].reverse().map((r) => ({
            key: r.recordId,
            label: (
              <Flex vertical gap={4}>
                <Flex justify="space-between" align="center" gap={8} wrap>
                  <Typography.Text strong>{name(r.chosenSupplierId)}</Typography.Text>
                  <Flex gap={4} wrap>
                    {r.mode.kind === "example" && <Tag style={{ marginInlineEnd: 0 }}>Example</Tag>}
                    <Tag style={{ marginInlineEnd: 0 }}>{r.followsRecommendation ? "Follows recommendation" : "Differs from recommendation"}</Tag>
                    {r.weightsReason && <Tag style={{ marginInlineEnd: 0 }}>Weights changed</Tag>}
                  </Flex>
                </Flex>
                <Typography.Text type="secondary">
                  {partNames[r.partId] ?? r.partId} · {formatDateTime(r.recordedAt)}
                  {r.decidedBy ? ` · ${r.decidedBy.name}` : ""}
                </Typography.Text>
                <span>{r.reason}</span>
              </Flex>
            ),
            children: (
              <Flex vertical gap={10} style={{ fontSize: 13 }}>
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  items={[
                    { label: "Material", children: `${partNames[r.partId] ?? r.partId} (${r.partId})` },
                    {
                      label: "Quantity · required by",
                      children: `${r.quantity.toLocaleString("en-GB")} pcs${r.neededBy ? ` · ${formatDay(r.neededBy)}` : ""}`,
                    },
                    ...(r.requisitionId ? [{ label: "Requisition", children: r.requisitionId }] : []),
                    { label: "Decided by", children: r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.role})` : "Not recorded" },
                    { label: "Awarded to", children: supplier(r.chosenSupplierId) },
                    { label: "Justification", children: r.reason },
                    {
                      label: "Compared offers",
                      children: (
                        <ol style={{ margin: 0, paddingLeft: 18 }}>
                          {r.ranking.map((x) => (
                            <li key={x.supplierId}>
                              {supplier(x.supplierId)}{" "}
                              {x.excluded ? "· excluded" : `· ${x.score === null ? "—" : formatNumber(x.score, 0)} points${x.supplierId === r.recommendedSupplierId ? " · recommended" : ""}`}
                            </li>
                          ))}
                        </ol>
                      ),
                    },
                    {
                      label: "Weights used",
                      children: (
                        <>
                          {r.defaultWeights && r.weightsReason ? (
                            <Tag style={{ marginInlineEnd: 6 }}>Changed</Tag>
                          ) : (
                            <Tag style={{ marginInlineEnd: 6 }}>Company default</Tag>
                          )}
                          {CRITERIA.map((c) => `${TOPIC_LABEL[c]} ${r.weights[c]} %`).join(", ")}
                          {r.defaultWeights && r.weightsReason && (
                            <div>
                              <Typography.Text type="secondary">
                                Company default: {CRITERIA.map((c) => `${TOPIC_LABEL[c]} ${r.defaultWeights![c]} %`).join(", ")}. Why changed: {r.weightsReason}
                              </Typography.Text>
                            </div>
                          )}
                        </>
                      ),
                    },
                    ...(r.vsCurrent
                      ? [
                          {
                            label: `Against ${name(r.vsCurrent.supplierId)}`,
                            children: [
                              r.vsCurrent.totalDeltaEur === null ? null : `cost ${signedEur(r.vsCurrent.totalDeltaEur)}`,
                              r.vsCurrent.co2TotalDeltaT === null
                                ? null
                                : r.vsCurrent.co2TotalDeltaT <= 0
                                  ? `${formatNumber(-r.vsCurrent.co2TotalDeltaT, 1)} t CO₂e avoided`
                                  : `${formatNumber(r.vsCurrent.co2TotalDeltaT, 1)} t CO₂e more`,
                            ]
                              .filter(Boolean)
                              .join(" · "),
                          },
                        ]
                      : []),
                  ]}
                />
                <CalculationTable record={r} name={name} />
                <div>Evidence of the chosen offer:</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {r.evidence.map((e, i) => (
                    <li key={i}>
                      {TOPIC_LABEL[e.topic]}: {String(e.value)} {displayUnit(e.unit)} · {e.status === "verified" ? "verified" : "not verified"} · {e.recordId},{" "}
                      {e.location}
                    </li>
                  ))}
                </ul>
              </Flex>
            ),
          }))}
        />
      )}
    </Flex>
  );
}

/** A reference value in its unit, e.g. "0.80 %", "84.50 €", "38.0 kg", "95.0 %". */
function referenceText(c: Criterion, v: number): string {
  if (c === "price") return `${formatNumber(v, 2)} €`;
  if (c === "co2") return `${formatNumber(v, v < 5 ? 2 : 1)} kg`;
  return `${formatNumber(v, c === "quality" ? 2 : 1)} %`;
}

/**
 * How the score of the chosen offer came about (17 Nov 2026): weight, reference "today", points and
 * what each criterion adds. So anyone (e.g. the Scope 3 manager) can follow the calculation later.
 * Older records without saved points show nothing here; their weights stay in "Weights used".
 */
function CalculationTable({ record: r, name }: { record: DecisionRecord; name: (id: string) => string }) {
  const chosen = r.ranking.find((x) => x.supplierId === r.chosenSupplierId);
  if (!chosen?.points) return null;
  const rows = CRITERIA.map((c) => ({
    c,
    weight: r.weights[c],
    defaultWeight: r.defaultWeights?.[c] ?? null,
    reference: r.reference?.[c] ?? null,
    points: chosen.points![c],
    adds: (chosen.points![c] * r.weights[c]) / 100,
  }));
  return (
    <Flex vertical gap={4}>
      <div>How the score of {name(r.chosenSupplierId)} was calculated:</div>
      <Table
        size="small"
        pagination={false}
        rowKey="c"
        dataSource={rows}
        aria-label="Calculation of the score"
        columns={[
          { title: "Criterion", key: "c", render: (_, x) => TOPIC_LABEL[x.c] },
          {
            title: "Weight",
            key: "w",
            align: "right",
            render: (_, x) =>
              x.defaultWeight !== null && x.defaultWeight !== x.weight ? `${x.weight} % (default ${x.defaultWeight} %)` : `${x.weight} %`,
          },
          {
            title: "Today (reference)",
            key: "r",
            align: "right",
            render: (_, x) => (x.reference ? <span title={x.reference.basis}>{referenceText(x.c, x.reference.value)}</span> : "—"),
          },
          { title: "Points", key: "p", align: "right", render: (_, x) => formatNumber(x.points, 0) },
          { title: "Adds", key: "a", align: "right", render: (_, x) => formatNumber(x.adds, 1) },
        ]}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={4}>
              <strong>Score</strong>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <strong>{chosen.score === null ? "—" : formatNumber(chosen.score, 1)}</strong>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Points 0–100: 50 = the same as today, +1 per 1 % better. Adds = points × weight. Hover a reference value for its source.
      </Typography.Text>
    </Flex>
  );
}
