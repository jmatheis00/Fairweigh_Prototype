"use client";

import { MailOutlined } from "@ant-design/icons";
import { Button, Flex, Table, Typography } from "antd";
import { SidePanel } from "./side-panel";
import {
  CRITERIA,
  co2CostEur,
  totalCo2Tonnes,
  totalCostEur,
  verifiedEvidence,
  type AgentRun,
  type Criterion,
  type DecisionRecord,
  type DecisionResult,
  type DemoSettings,
  type Weights,
} from "@scc/shared";
import { DRAWER_WIDTH } from "@/lib/layout";
import { priceRequestMailto } from "@/lib/price-request";
import { TOPIC_LABEL, formatNumber, formatEur, formatCriterionVsToday, formatCriterionRange, formatVsToday } from "@/lib/labels";
import { FavouriteButton, PreviousDecisions } from "./previous-decisions";
import { SupplierHistory } from "./supplier-history";

/**
 * Criteria profile: points (0–100) per criterion for one supplier, next to
 * the recommended offer (or the runner-up, if this is the recommended one).
 * Two series: slot 1 = this supplier, slot 2 = comparison. Legend plus direct labels.
 */

const BAR_H = 12;
const GAP = 2;
const ROW_H = BAR_H * 2 + GAP + 20;
const LABEL_W = 150;
const PLOT_W = 230;
const W = LABEL_W + PLOT_W + 40;

interface Props {
  supplierId: string | null;
  run: AgentRun | null;
  settings: DemoSettings | null;
  result: DecisionResult | null;
  weights: Weights;
  supplierNames: Record<string, string>;
  onClose: () => void;
  favourites: string[];
  onToggleFavourite: (supplierId: string) => void;
  decisions: DecisionRecord[];
  partNames: Record<string, string>;
  onOpenDecision: (record: DecisionRecord) => void;
}

/** Value in the unit of its criterion, e.g. "84.50 €", "0.8 % complaints". */
function valueText(c: Criterion, v: number): string {
  switch (c) {
    case "quality":
      return `${formatNumber(v, 1)} % complaints`;
    case "price":
      return formatEur(v, 2);
    case "co2":
      return `${formatNumber(v, 1)} kg CO₂e`;
    case "delivery":
      return `${formatNumber(v, 0)} % on time`;
  }
}

export function SupplierProfile({
  supplierId,
  run,
  settings,
  result,
  weights,
  supplierNames,
  onClose,
  favourites,
  onToggleFavourite,
  decisions,
  partNames,
  onOpenDecision,
}: Props) {
  const name = (id: string) => supplierNames[id] ?? id;
  const ranked = result?.ranked.find((r) => r.supplierId === supplierId);
  const excluded = result?.excluded.find((x) => x.supplierId === supplierId);
  const recommendedId = result?.recommendation?.supplierId ?? null;
  const compareId = supplierId === recommendedId ? (result?.recommendation?.runnerUpId ?? null) : recommendedId;
  const compare = result?.ranked.find((r) => r.supplierId === compareId);
  // The recommended supplier is always the accent teal bar, the other one light teal (pitch design v4, review 16 Nov 2026).
  const selfIsHighlight = supplierId === recommendedId || !compare || compare.supplierId !== recommendedId;
  const H = CRITERIA.length * ROW_H + 8;

  // Totals for the requested quantity, from verified values only. Display, not in the score.
  const number = (topic: "price" | "co2") => {
    const e = run && supplierId ? verifiedEvidence(run, supplierId, topic) : undefined;
    return e && typeof e.value === "number" ? e.value : null;
  };
  const price = number("price");
  const pcf = number("co2");
  const quantity = run?.request.quantity ?? 0;
  const benchmarks = settings?.catalog.find((p) => p.partId === run?.request.partId)?.benchmarks ?? null;
  // Gap to the recommendation or to second place: moved here from the recommendation tile (10 Nov 2026).
  const gap =
    ranked && compare
      ? supplierId === recommendedId
        ? `${formatNumber(ranked.score - compare.score, 1)} percentage points ahead of ${name(compare.supplierId)}`
        : `${formatNumber(compare.score - ranked.score, 1)} percentage points behind the recommendation, ${name(compare.supplierId)}`
      : null;

  return (
    <SidePanel
      open={supplierId !== null}
      contentKey={supplierId}
      onClose={onClose}
      size={DRAWER_WIDTH}
      title={supplierId ? `Offer details · ${name(supplierId)}` : ""}
      extra={
        supplierId ? (
          <Flex gap={8} align="center">
            {run && ranked && (
              <Button size="small" icon={<MailOutlined />} href={priceRequestMailto(run, supplierId, name(supplierId), partNames[run.request.partId] ?? run.request.partId)}>
                Request current price
              </Button>
            )}
            <FavouriteButton favourite={favourites.includes(supplierId)} onToggle={() => onToggleFavourite(supplierId)} name={name(supplierId)} />
          </Flex>
        ) : null
      }
    >
      {supplierId && excluded && (
        <Typography.Paragraph type="danger" strong>
          Excluded, no score: {excluded.knockOut.reason}
        </Typography.Paragraph>
      )}
      {supplierId && ranked && (
        <Flex vertical gap={12} className="viz-root">
          <Typography.Text>
            Rank {ranked.rank} · <Typography.Text strong>{formatVsToday(ranked.score)}</Typography.Text> ·{" "}
            {ranked.verifiedCount} of {CRITERIA.length} criteria verified
            {gap ? ` · ${gap}` : ""}
          </Typography.Text>

          {benchmarks && run && (
            <Table
              size="small"
              pagination={false}
              rowKey="c"
              aria-label="The four criteria against today"
              dataSource={CRITERIA.map((c) => {
                const e = verifiedEvidence(run, supplierId, c);
                return { c, value: e && typeof e.value === "number" ? e.value : null, points: ranked.points[c] };
              })}
              columns={[
                { title: "Criterion", key: "c", render: (_, r) => TOPIC_LABEL[r.c] },
                { title: "This offer", key: "v", align: "right", render: (_, r) =>
                    r.value !== null ? valueText(r.c, r.value) : ranked.assumed.includes(r.c) ? "range: never delivered" : "missing · 0 pts" },
                {
                  title: "Today",
                  key: "b",
                  align: "right",
                  render: (_, r) => (
                    <span title={benchmarks[r.c].basis}>
                      {valueText(r.c, benchmarks[r.c].value)}
                      {benchmarks[r.c].sourceUrl && (
                        <>
                          {" · "}
                          <a href={benchmarks[r.c].sourceUrl!} target="_blank" rel="noreferrer">
                            {benchmarks[r.c].short}
                          </a>
                        </>
                      )}
                    </span>
                  ),
                },
                {
                  title: "vs today",
                  key: "p",
                  align: "right",
                  render: (_, r) =>
                    r.value === null
                      ? ranked.assumed.includes(r.c)
                        ? formatCriterionRange(r.points, ranked.pointsHigh?.[r.c] ?? r.points)
                        : "50 % worse (missing)"
                      : formatCriterionVsToday(r.points),
                },
              ]}
            />
          )}

          <Flex gap={16} wrap style={{ fontSize: 12 }}>
            <Flex align="center" gap={6}>
              <span className="viz-swatch" style={{ background: selfIsHighlight ? "var(--viz-series-1)" : "var(--viz-series-2)" }} />
              {name(supplierId)}
            </Flex>
            {compare && (
              <Flex align="center" gap={6}>
                <span className="viz-swatch" style={{ background: selfIsHighlight ? "var(--viz-series-2)" : "var(--viz-series-1)" }} />
                {name(compare.supplierId)} ({compare.supplierId === recommendedId ? "recommended" : "second place"})
              </Flex>
            )}
          </Flex>

          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Points per criterion">
            {CRITERIA.map((c, i) => {
              const top = i * ROW_H + 4;
              const bars = [
                { key: "self", points: ranked.points[c], missing: ranked.missing.includes(c), cls: selfIsHighlight ? "viz-bar-1" : "viz-bar-2" },
                ...(compare
                  ? [{ key: "cmp", points: compare.points[c], missing: compare.missing.includes(c), cls: selfIsHighlight ? "viz-bar-2" : "viz-bar-1" }]
                  : []),
              ];
              return (
                <g key={c}>
                  <text x={0} y={top + BAR_H + 2} className="viz-label">
                    {TOPIC_LABEL[c]}
                  </text>
                  <text x={0} y={top + BAR_H + 16} className="viz-tick">
                    weight {weights[c]} %
                  </text>
                  {bars.map((b, j) => {
                    const by = top + j * (BAR_H + GAP);
                    const w = (b.points / 100) * PLOT_W;
                    return (
                      <g key={b.key}>
                        <rect x={LABEL_W} y={by} width={PLOT_W} height={BAR_H} className="viz-track" />
                        <line x1={LABEL_W + PLOT_W / 2} x2={LABEL_W + PLOT_W / 2} y1={by - 1} y2={by + BAR_H + 1} className="viz-today" />
                        {w > 0 && <rect x={LABEL_W} y={by} width={w} height={BAR_H} rx={2} className={b.cls} />}
                        <text x={LABEL_W + Math.max(w, 0) + 6} y={by + BAR_H - 2} className="viz-tick">
                          {b.missing ? "missing · 50 % worse" : formatCriterionVsToday(b.points)}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Bars from 50 % worse (left edge) to 50 % better (right edge) than today; the middle is today (average of the last 3
            purchases). Missing or unverified values count as 50 % worse.
          </Typography.Text>
        </Flex>
      )}
      {supplierId && run && settings && (
        <>
          <Typography.Title level={5}>Totals for {quantity.toLocaleString("en-GB")} pieces</Typography.Title>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Total price: {price === null ? "not verified" : formatEur(totalCostEur(price, quantity), 2)}</li>
            <li>CO₂ total: {pcf === null ? "not verified" : `${formatNumber(totalCo2Tonnes(pcf, quantity), 1)} t CO₂e`}</li>
            <li>
              CO₂ in euros ({settings.co2PricePerTonneEur} €/t{settings.co2PriceToConfirm ? ", to be confirmed" : ""}):{" "}
              {pcf === null ? "not verified" : formatEur(co2CostEur(pcf, quantity, settings.co2PricePerTonneEur), 2)} · information only,
              not in the score
            </li>
          </ul>
        </>
      )}
      {supplierId && (ranked?.warnings.length ?? excluded?.warnings.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5}>Notes</Typography.Title>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            {(ranked?.warnings ?? excluded?.warnings ?? []).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      )}
      {supplierId && (
        <div style={{ marginTop: 16 }}>
          <PreviousDecisions supplierId={supplierId} decisions={decisions} partNames={partNames} onOpen={onOpenDecision} />
        </div>
      )}
      {supplierId && (
        <div style={{ marginTop: 16 }}>
          <SupplierHistory supplierId={supplierId} />
        </div>
      )}
    </SidePanel>
  );
}
