"use client";

import { CheckCircleOutlined, CloudOutlined, EuroOutlined, InfoCircleOutlined, RobotOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";
import { Button, Card, Flex, Table, Tag, Tooltip, Typography } from "antd";
import { CRITERIA, cellEvidence, compareWithBaseline, isSupplierSpecific, percentBetter, type Benchmark, type Criterion, type AgentRun, type DecisionResult, type Weights, type WeightSensitivity } from "@scc/shared";
import { TOPIC_LABEL, formatNumber, formatEur, formatCriterionVsToday, formatDiff, formatVsToday, formatVsTodayShort } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { Delta, decisionSummaryParts, signed } from "./decision-summary";

interface Props {
  run: AgentRun;
  result: DecisionResult;
  supplierNames: Record<string, string>;
  /** Supplier with an active contract, from the ERP. */
  currentSupplierId: string | null;
  co2PricePerTonneEur: number;
  co2PriceToConfirm: boolean;
  /** Nearest weight change that would make another offer lead, or null. */
  nearestFlip: WeightSensitivity | null;
    /** Opens the supplier profile in the side panel. */
  onOpenSupplier: (supplierId: string) => void;
  /** Product, quantity and date of the request, e.g. "Aluminium die-cast housing · 10,000 pcs". */
  requestLabel: string;
  /** Opens "How is the score calculated?" (criteria, weights, sources). */
  onExplainScore: () => void;
  /** Opens the agent log of the run (moved here from the recommendation box, 18 Nov 2026). */
  onShowLog: () => void;
  /** Weights the ranking uses, to show what each criterion adds to the score. */
  weights: Weights;
  /** Published industry average CO₂ per piece: context only, not scored (17 Nov 2026). */
  industryCo2?: Benchmark | null;
  /** Complaint rate today (% of deliveries), to explain the quality points in plain numbers; null if unknown. */
  qualityToday?: number | null;
}

/** Criterion inside a sentence: lower case, except the chemical formula CO₂. */
const criterionWord = (c: Criterion) => (c === "co2" ? "CO₂" : TOPIC_LABEL[c].toLowerCase());

/** A criterion value in plain words, e.g. "10.9 kg CO₂", "63.24 €". */
function valueText(c: Criterion, v: number): string {
  switch (c) {
    case "quality":
      return `${formatNumber(v, 1)} % complaints`;
    case "price":
      return formatEur(v, 2);
    case "co2":
      return `${formatNumber(v, 1)} kg CO₂`;
    case "delivery":
      return `${formatNumber(v, 0)} % on time`;
  }
}

/**
 * Content of the "Why this recommendation?" side panel: everything the compact block on the compare step leaves out.
 * Layout (feedback 17 Nov 2026): header with score and status tags, how the score adds up per criterion,
 * two figure cards against the current supplier, then exclusions and gaps as a short list.
 */
export function RecommendationDetails({
  run,
  result,
  supplierNames,
  currentSupplierId,
  co2PricePerTonneEur,
  co2PriceToConfirm,
  nearestFlip,
  onOpenSupplier,
  requestLabel,
  onExplainScore,
  onShowLog,
  weights,
  industryCo2 = null,
  qualityToday = null,
}: Props) {
  const rec = result.recommendation;
  const first = result.ranked[0];
  const runnerUp = rec?.runnerUpId ? result.ranked.find((r) => r.supplierId === rec.runnerUpId) : undefined;
  const name = (id: string) => shortName(supplierNames[id] ?? id);
  const cmp = rec && currentSupplierId ? compareWithBaseline(run, rec.supplierId, currentSupplierId, co2PricePerTonneEur) : null;
  const isCurrent = rec?.supplierId === currentSupplierId;
  const verified = run.evidence.filter((e) => e.status === "verified").length;
  const pcs = `${run.request.quantity.toLocaleString("en-GB")} pcs`;
  // Coverage of the CO₂ data-quality ladder (Sprint 3 story 2): only offers with a score count,
  // so excluded offers do not dilute it. An offer without a verified CO₂ value is not supplier-specific.
  const co2Of = (supplierId: string) =>
    run.evidence.find((e) => e.supplierId === supplierId && e.topic === "co2" && e.status === "verified") ?? null;
  const co2Specific = result.ranked.filter((r) => isSupplierSpecific(co2Of(r.supplierId)?.sourceBadge)).length;
  const recBadge = rec ? (co2Of(rec.supplierId)?.sourceBadge ?? null) : null;
  // Industry average as context only (17 Nov 2026): "we should improve" or "we are fine", never in the score.
  const recCo2 = rec ? co2Of(rec.supplierId)?.value : null;
  const industryPct = industryCo2 && typeof recCo2 === "number" ? Math.round(percentBetter("co2", recCo2, industryCo2.value)) : null;
  const industryLine =
    industryCo2 && industryPct !== null ? (
      <>
        Against the industry: {formatNumber(recCo2 as number, recCo2 as number < 5 ? 2 : 1)} kg CO₂ per piece is{" "}
        <strong>{industryPct === 0 ? "the same as" : `${Math.abs(industryPct)} % ${industryPct > 0 ? "below" : "above"}`}</strong> the published average of{" "}
        {formatNumber(industryCo2.value, industryCo2.value < 5 ? 2 : 1)} kg ({industryCo2.sourceUrl ? (
          <a href={industryCo2.sourceUrl} target="_blank" rel="noreferrer" title={industryCo2.basis}>
            {industryCo2.short}
          </a>
        ) : (
          industryCo2.short
        )}
        , material only).{" "}
        <Typography.Text type="secondary">· context only, not in the score</Typography.Text>
      </>
    ) : null;
  const summary = decisionSummaryParts({ run, result, supplierNames, currentSupplierId, co2PricePerTonneEur });

  const value = (id: string, c: Criterion) => {
    const e = cellEvidence(run, id, c);
    return e?.status === "verified" && typeof e.value === "number" ? e.value : null;
  };
  const flipText = (() => {
    if (!rec || !nearestFlip || nearestFlip.flipsAt === null || !nearestFlip.newLeaderId) return null;
    const c = nearestFlip.criterion;
    const theirs = value(nearestFlip.newLeaderId, c);
    const ours = value(rec.supplierId, c);
    const weightText = `${criterionWord(c)} weighs ${nearestFlip.direction === "up" ? "≥" : "≤"} ${nearestFlip.flipsAt} %`;
    return theirs !== null && ours !== null
      ? `${name(nearestFlip.newLeaderId)} would lead if ${weightText}: ${valueText(c, theirs)} vs ${valueText(c, ours)}`
      : `${name(nearestFlip.newLeaderId)} would lead if ${weightText}`;
  })();

  const section = (icon: ReactNode, text: string) => (
    <Typography.Title level={5} style={{ margin: "20px 0 8px" }}>
      {icon} {text}
    </Typography.Title>
  );

  // How the result adds up (18 Nov 2026): % against today × weight per criterion; the four rows sum to the weighted average.
  const rows = first
    ? CRITERIA.map((c) => {
        const v = value(first.supplierId, c);
        return {
          c,
          value: v !== null ? valueText(c, v) : first.assumed.includes(c) ? "range: never delivered" : "missing",
          points: first.points[c],
          adds: ((first.points[c] - 50) * weights[c]) / 100,
          runnerUpAdds: runnerUp ? ((runnerUp.points[c] - 50) * weights[c]) / 100 : null,
        };
      })
    : [];

  // Quality in plain numbers (18 Nov 2026): it counts deliveries without a complaint, so the ERP complaint rate is turned round.
  const qualityValue = first ? value(first.supplierId, "quality") : null;
  const qualityNote =
    qualityValue !== null && qualityToday !== null && qualityValue !== qualityToday
      ? `Product quality: ${formatNumber(100 - qualityValue, 1)} % vs ${formatNumber(100 - qualityToday, 1)} % today of deliveries without a complaint (${formatNumber(qualityValue, 1)} % vs ${formatNumber(qualityToday, 1)} % with one) = ${formatNumber(Math.abs(percentBetter("quality", qualityValue, qualityToday)), 1)} % ${percentBetter("quality", qualityValue, qualityToday) > 0 ? "better" : "worse"}.`
      : null;

  const figure = (title: ReactNode, delta: ReactNode, lines: ReactNode) => (
    <Card size="small" style={{ flex: "1 1 240px" }} title={title}>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{delta}</div>
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {lines}
      </Typography.Text>
    </Card>
  );

  return (
    <div>
      <Typography.Text type="secondary">{requestLabel}</Typography.Text>
      {rec && first ? (
        <Card size="small" style={{ marginTop: 8, background: "var(--surface-muted, #f5f5f5)" }}>
          <Flex justify="space-between" align="flex-start" gap={16}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Recommended
              </Typography.Text>
              <Typography.Title level={4} style={{ margin: "2px 0 8px" }}>
                {name(rec.supplierId)}
              </Typography.Title>
              <Flex gap={6} wrap align="center">
                <Tag icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>
                  {first.verifiedCount}/{CRITERIA.length} criteria verified
                </Tag>
                <Tag icon={<CloudOutlined />} style={{ marginInlineEnd: 0 }}>
                  CO₂ value: {recBadge ?? "not verified"}
                </Tag>
                {rec.bestIn.map((c) => (
                  <Tag key={c} style={{ marginInlineEnd: 0 }}>
                    Best in {criterionWord(c)}
                  </Tag>
                ))}
              </Flex>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1 }}>
                {formatVsTodayShort(rec.score) === "same" ? "Same" : formatVsTodayShort(rec.score)}
                <Typography.Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
                  {formatVsTodayShort(rec.score) === "same" ? " as today" : " than today"}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {runnerUp
                  ? `${formatNumber(rec.score - runnerUp.score, 1)} percentage points ahead of ${name(runnerUp.supplierId)}`
                  : "only offer with a score"}
              </Typography.Text>
              <div>
                <Button type="link" size="small" className="inline-link" onClick={() => onOpenSupplier(rec.supplierId)}>
                  Open supplier profile
                </Button>
              </div>
            </div>
          </Flex>
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            {flipText ? (
              <>
                <WarningOutlined /> {flipText}
              </>
            ) : (
              <>
                <CheckCircleOutlined /> Robust: stays first for every allowed weight
              </>
            )}
          </div>
        </Card>
      ) : (
        <Typography.Title level={4} style={{ margin: "8px 0 0" }}>
          No offer with a score
        </Typography.Title>
      )}

      {first && (
        <>
          {section(<CheckCircleOutlined />, `How the result comes together: ${formatVsToday(first.score)}`)}
          <Table
            size="small"
            pagination={false}
            rowKey="c"
            dataSource={rows}
            aria-label="Percent against today and weight per criterion"
            columns={[
              { title: "Criterion", key: "c", render: (_, r) => TOPIC_LABEL[r.c] },
              { title: "Value", key: "v", render: (_, r) => r.value },
              { title: "vs today", key: "p", align: "right", render: (_, r) => formatCriterionVsToday(r.points) },
              { title: "Weight", key: "w", align: "right", render: (_, r) => `${weights[r.c]} %` },
              { title: "Adds", key: "a", align: "right", render: (_, r) => <strong>{formatDiff(r.adds, 1, "0 %")}</strong> },
              ...(runnerUp
                ? [{ title: name(runnerUp.supplierId), key: "r", align: "right" as const, render: (_: unknown, r: (typeof rows)[number]) => formatDiff(r.runnerUpAdds ?? 0, 1, "0 %") }]
                : []),
            ]}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={4}>
                  <strong>Weighted average vs today</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <strong>{formatVsTodayShort(first.score, 1)}</strong>
                </Table.Summary.Cell>
                {runnerUp && (
                  <Table.Summary.Cell index={5} align="right">
                    {formatVsTodayShort(runnerUp.score, 1)}
                  </Table.Summary.Cell>
                )}
              </Table.Summary.Row>
            )}
          />
          {qualityNote && (
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
              {qualityNote}
            </Typography.Text>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Per criterion: % better or worse than today (average of the last 3 purchases). Quality counts deliveries without a
            complaint, delivery the deliveries on time, price and CO₂ less money and less CO₂; capped at ±50 %. Adds = % × weight; the
            sum is the weighted average.
          </Typography.Text>
        </>
      )}

      {section(<EuroOutlined />, `Against your current supplier${currentSupplierId ? ` (${name(currentSupplierId)})` : ""}`)}
      {isCurrent ? (
        <div>The recommendation is your current supplier.</div>
      ) : cmp ? (
        <Flex gap={12} wrap>
          {figure(
            <>
              <EuroOutlined /> Price
            </>,
            <Delta value={cmp.priceDeltaEur} digits={2} unit=" €/pc" lowerIsBetter />,
            <>
              {cmp.pricePercent !== null ? `${signed(cmp.pricePercent, 1, " %")} per piece` : ""}
              {cmp.totalDeltaEur !== null ? ` · ${signed(cmp.totalDeltaEur, 0, " €")} for ${pcs}` : ""}
            </>,
          )}
          {figure(
            <>
              <CloudOutlined /> CO₂
            </>,
            <Delta value={cmp.co2DeltaKg} digits={1} unit=" kg/pc" lowerIsBetter />,
            <>
              {cmp.co2Percent !== null ? `${signed(cmp.co2Percent, 1, " %")} per piece` : ""}
              {cmp.co2TotalDeltaT !== null ? ` · ${signed(cmp.co2TotalDeltaT, 1, " t")} CO₂e for ${pcs}` : ""}
            </>,
          )}
        </Flex>
      ) : (
        <Typography.Text type="secondary">No current supplier among the offers</Typography.Text>
      )}
      {!isCurrent && cmp?.totalWithCo2DeltaEur != null && (
        <div style={{ marginTop: 8 }}>
          With CO₂ at {co2PricePerTonneEur} €/t:{" "}
          <strong>
            {cmp.totalWithCo2DeltaEur === 0
              ? "same cost overall"
              : `${formatEur(Math.abs(cmp.totalWithCo2DeltaEur), 0)} ${cmp.totalWithCo2DeltaEur < 0 ? "cheaper" : "more expensive"} overall`}
          </strong>{" "}
          <Tooltip
            title={`Your internal CO₂ price of ${co2PricePerTonneEur} € per tonne${co2PriceToConfirm ? " (to confirm)" : ""}, added to the price. Display only: it does not count towards the score. CO₂ already counts in the score as its own criterion.`}
          >
            <InfoCircleOutlined tabIndex={0} aria-label="Display only, does not count towards the score" />
          </Tooltip>{" "}
          <Typography.Text type="secondary">· display only, not in the score</Typography.Text>
        </div>
      )}

      {industryLine && <div style={{ marginTop: 8 }}>{industryLine}</div>}

      {section(<WarningOutlined />, "Exclusions and data gaps")}
      <ul className="why-list">
        {summary.exclusions && (
          <li>
            <StopOutlined aria-hidden /> {summary.exclusions}
          </li>
        )}
        {summary.gaps && (
          <li>
            <WarningOutlined aria-hidden /> {summary.gaps}
          </li>
        )}
        {summary.couldLead && (
          <li>
            <InfoCircleOutlined aria-hidden /> {summary.couldLead}
          </li>
        )}
        {!summary.exclusions && !summary.gaps && !summary.couldLead && (
          <li>
            <CheckCircleOutlined aria-hidden /> No offer is excluded and no offer has data gaps.
          </li>
        )}
        <li>
          <CheckCircleOutlined aria-hidden /> {verified} values verified
          {run.evidence.length - verified > 0 ? `, ${run.evidence.length - verified} rejected by the evidence check` : ""}. {co2Specific} of{" "}
          {result.ranked.length} scored {result.ranked.length === 1 ? "offer has" : "offers have"} supplier-specific CO₂ data.
        </li>
      </ul>

      <div className="kpi-ai-note" style={{ marginTop: 16 }}>
        <RobotOutlined aria-hidden /> AI suggestion: AI collects the evidence, fixed rules rank it. You decide.{" "}
        <Button type="link" size="small" className="inline-link" onClick={onExplainScore}>
          How is the score calculated?
        </Button>
        <Typography.Text type="secondary"> · </Typography.Text>
        <Button type="link" size="small" className="inline-link" onClick={onShowLog}>
          Agent log
        </Button>
      </div>
    </div>
  );
}
