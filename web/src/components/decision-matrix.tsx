"use client";

import { ArrowDownOutlined, ArrowUpOutlined, CloseCircleOutlined, MailOutlined, MinusCircleOutlined, MinusOutlined, QuestionCircleOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Flex, Table, Tooltip, Typography, type TableColumnsType } from "antd";
import type { ReactNode } from "react";
import { useIsBelowLaptop } from "@/lib/use-phone";
import {
  CRITERIA,
  cellEvidence,
  percentBetter,
  type AgentRun,
  type Benchmark,
  type Benchmarks,
  type NewSupplierAssumption,
  type Criterion,
  type DecisionResult,
  type Evidence,
} from "@scc/shared";
import { AGE_NOTE, SCORE_BAND_LABEL, knockOutLabel, TOPIC_LABEL, formatNumber, scoreBand, formatEur, formatVsToday, formatVsTodayShort, formatVsTodayRange, formatCriterionVsToday, formatCriterionRange } from "@/lib/labels";
import { shortNote } from "@/lib/notes";
import { priceRequestMailto } from "@/lib/price-request";
import { PcfBadgeTag } from "./pcf-badge-tag";
import { BRAND } from "@/lib/theme";

interface Row {
  key: string;
  supplierId: string;
  rank: number | null;
  score: number | null;
  points: Record<Criterion, number> | null;
  verifiedCount: number | null;
  notes: string[];
  /** Age warnings of this offer; shown as the date in the cell, not as a note. */
  ageWarnings: string[];
  exclusion: string | null;
  /** Criteria scored with an assumed value (supplier never delivered). */
  assumed?: Criterion[];
  /** Score range of a supplier without deliveries (low = ranking score). */
  scoreRange?: { low: number; high: number } | null;
  pointsHigh?: Partial<Record<Criterion, number>> | null;
}

interface Props {
  run: AgentRun;
  result: DecisionResult;
  supplierNames: Record<string, string>;
  selectedId: string | null;
  onOpen: (evidence: Evidence) => void;
  onOpenSupplier: (supplierId: string) => void;
  /** Reference values of the product (today: average of the last three purchases); null falls back to the ranking among the offers. */
  benchmarks: Benchmarks | null;
  /** Published industry average CO₂ per piece: context only, not scored. */
  industryCo2?: Benchmark | null;
  /** Suppliers that never delivered to us (quote or new candidate): no ERP delivery or complaint figures can exist. */
  noDeliveries?: Set<string>;
  /** Weakest values of our current suppliers in the category, used for suppliers that never delivered. */
  assumption?: NewSupplierAssumption | null;
  /** Product name for the price request e-mail. */
  partName: string;
}

/** What the points under each value mean (PLAN.md section 3, decision of 17 Nov 2026: against today). */
const POINTS_HELP =
  "Under each value: how many % better or worse than today. Quality counts deliveries without a complaint, delivery the deliveries on time, price and CO₂ less money and less CO₂. Capped at ±50 %; a missing or unverified value counts as 50 % worse.";
const POINTS_HELP_RELATIVE =
  "Points 0–100 among the scored offers: the best verified value gets 100, the worst 0, the others in between. Missing or unverified values get 0.";

/** A benchmark in the unit of its column, e.g. "90.00 €", "95.2 %". */
function benchmarkValue(c: Criterion, value: number): string {
  switch (c) {
    case "quality":
      return `${formatNumber(value, 2)} %`;
    case "price":
      return formatEur(value, 2);
    case "co2":
      return `${formatNumber(value, 1)} kg`;
    case "delivery":
      return `${formatNumber(value, 1)} %`;
  }
}

/** "6 % better", "12 % worse", "same as today". */
function versusBenchmark(c: Criterion, value: number, benchmark: number): string {
  const p = Math.round(percentBetter(c, value, benchmark));
  if (p === 0) return "same as today";
  return `${Math.abs(p)} % ${p > 0 ? "better" : "worse"}`;
}

/** What each column measures, shown above the points rule. */
const MEASURE: Record<Criterion, string> = {
  quality: "Complaint rate from the ERP: share of deliveries with a complaint. Lower is better.",
  price: "Unit price from the supplier's offer. Lower is better.",
  co2: "Product carbon footprint per piece (kg CO₂e) from the CO₂ record. Lower is better. The tag shows the data quality.",
  delivery: "Share of on-time deliveries from the ERP. Higher is better.",
};

const HEADERS: Record<Criterion, string> = {
  quality: "Quality",
  price: "Price/piece",
  co2: "CO₂/piece",
  delivery: "Delivery",
};

function mainValue(c: Criterion, value: number): string {
  switch (c) {
    case "quality":
      return `${formatNumber(value, 1)} % compl.`;
    case "price":
      return formatEur(value, 2);
    case "co2":
      return `${formatNumber(value, 1)} kg`;
    case "delivery":
      return `${formatNumber(value, 0)} % on time`;
  }
}

/**
 * Points with a status: above 55 better than today (arrow up), below 45 worse (arrow down),
 * otherwise about the same as today. Colour always comes with the arrow and the number.
 */
function PointsLine({ points, hint }: { points: number; hint: string | null }) {
  const tone = points >= 55 ? "better" : points <= 45 ? "worse" : "same";
  const icon = tone === "better" ? <ArrowUpOutlined /> : tone === "worse" ? <ArrowDownOutlined /> : <MinusOutlined />;
  return (
    <Tooltip title={hint}>
      <span className={`points-line delta-${tone}`} aria-label={`${formatCriterionVsToday(points)}, ${tone === "same" ? "about the same as" : `${tone} than`} today`}>
        {icon} {formatCriterionVsToday(points)}
      </span>
    </Tooltip>
  );
}

export function DecisionMatrix({ run, result, supplierNames, selectedId, onOpen, onOpenSupplier, benchmarks, industryCo2, noDeliveries, assumption, partName }: Props) {
  // Cards on phones and tablets: the eight-column table only fits from laptop width on (review 16 Nov 2026).
  const isPhone = useIsBelowLaptop();
  const rows: Row[] = [
    ...result.ranked.map((r) => ({
      key: r.supplierId,
      supplierId: r.supplierId,
      rank: r.rank,
      score: r.score,
      points: r.points,
      verifiedCount: r.verifiedCount,
      assumed: r.assumed,
      scoreRange: r.scoreRange,
      pointsHigh: r.pointsHigh,
      notes: [
        ...(r.verifiedCount < CRITERIA.length
          ? [`${r.verifiedCount} of ${CRITERIA.length} verified${r.assumed.length ? ` · ${r.assumed.length} as range` : ""}`]
          : []),
        ...r.warnings.filter((w) => !AGE_NOTE.test(w)),
      ],
      ageWarnings: r.warnings.filter((w) => AGE_NOTE.test(w)),
      exclusion: null,
    })),
    ...result.excluded.map((x) => ({
      key: x.supplierId,
      supplierId: x.supplierId,
      rank: null,
      score: null,
      points: null,
      verifiedCount: null,
      notes: x.warnings.filter((w) => !AGE_NOTE.test(w)),
      ageWarnings: x.warnings.filter((w) => AGE_NOTE.test(w)),
      exclusion: `EXCLUDED: ${x.knockOut.reason}`,
    })),
  ];

  // Fixed widths so values never run into the next column; the supplier column (with its notes) takes the rest.
  // Narrow matrix (16 Nov 2026): notes sit under the supplier name, the CO₂ source tag under the value, so the
  // priorities and the price-vs-CO₂ map get more room on the right.
  const WIDTHS: Record<Criterion, number> = { quality: 104, price: 108, co2: 112, delivery: 108 };
  const criterionColumn = (c: Criterion) => ({
    title: (
      <span style={{ whiteSpace: "nowrap" }}>
        {HEADERS[c]}{" "}
        <Tooltip
          placement="bottom"
          arrow={{ pointAtCenter: true }}
          trigger={["hover", "focus"]}
          title={
            <div>
              <div style={{ marginBottom: 4 }}>{MEASURE[c]}</div>
              {benchmarks && (
                <div style={{ marginBottom: 4 }}>
                  <strong>Today {benchmarkValue(c, benchmarks[c].value)}:</strong> {benchmarks[c].basis}.{" "}
                  {benchmarks[c].sourceUrl && (
                    <a href={benchmarks[c].sourceUrl!} target="_blank" rel="noreferrer" style={{ color: BRAND.onDark }}>
                      Open source
                    </a>
                  )}
                </div>
              )}
              <div>{benchmarks ? POINTS_HELP : POINTS_HELP_RELATIVE}</div>
              {c === "co2" && industryCo2 && (
                <div style={{ marginTop: 4 }}>
                  <strong>Industry average {benchmarkValue(c, industryCo2.value)}</strong> (context only, not scored): {industryCo2.basis}.{" "}
                  {industryCo2.sourceUrl && (
                    <a href={industryCo2.sourceUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.onDark }}>
                      Open source
                    </a>
                  )}
                </div>
              )}
            </div>
          }
        >
          <QuestionCircleOutlined
            tabIndex={0}
            role="button"
            aria-label={`How ${HEADERS[c]} is scored`}
            style={{ fontSize: 12, color: BRAND.textTertiary, cursor: "help" }}
          />
        </Tooltip>
      </span>
    ),
    key: c,
    width: WIDTHS[c],
    align: "right" as const,
    render: (_: unknown, row: Row) => {
      const evidence = cellEvidence(run, row.supplierId, c);
      if (!evidence && row.assumed?.includes(c) && assumption && (c === "quality" || c === "delivery")) {
        const weak = assumption[c];
        const best = c === "quality" ? assumption.qualityBest : assumption.deliveryBest;
        const decimals = c === "quality" ? 1 : 0;
        const lo = row.points?.[c] ?? 0;
        const hi = row.pointsHigh?.[c] ?? lo;
        return (
          <Tooltip
            title={`Never delivered to us, so no own figure yet. Range of our ${assumption.peers} current suppliers in this category: weakest ${formatNumber(weak, decimals)} %, best ${formatNumber(best, decimals)} %. The ranking uses the weakest, so a gap never beats real data.`}
          >
            <Flex vertical align="end" tabIndex={0} className="assumed-cell">
              <span>
                ≈ {formatNumber(Math.min(weak, best), decimals)}–{formatNumber(Math.max(weak, best), decimals)} %
              </span>
              {/* "0.4 % worse to 0.4 % better" is too wide for the column: one line per end. */}
              {formatCriterionRange(lo, hi)
                .split(/ (?=to )/)
                .map((part) => (
                  <span key={part} className="points-line delta-same">
                    {part}
                  </span>
                ))}
            </Flex>
          </Tooltip>
        );
      }
      if (!evidence) {
        // Quality and delivery come from deliveries; a supplier that never delivered cannot have them yet.
        const never = (c === "quality" || c === "delivery") && noDeliveries?.has(row.supplierId);
        return (
          <Tooltip
            title={
              never
                ? "This supplier has never delivered to us, so the ERP has no complaint or on-time figures yet. Counts as 50 % worse than today until a sample delivery is rated."
                : "No verified value in the connected systems. Counts as 50 % worse than today."
            }
          >
            <Flex vertical align="end" tabIndex={0}>
              <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
                <MinusCircleOutlined /> {never ? "No deliveries" : "Data missing"}
              </Typography.Text>
              {row.points && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  50 % worse
                </Typography.Text>
              )}
            </Flex>
          </Tooltip>
        );
      }
      const label = `${TOPIC_LABEL[c]} of ${supplierNames[row.supplierId] ?? row.supplierId}`;
      if (evidence.status !== "verified" || typeof evidence.value !== "number") {
        return (
          <Button type="text" size="small" danger onClick={() => onOpen(evidence)} aria-label={`Open rejected evidence: ${label}`}>
            <CloseCircleOutlined /> Not verified
          </Button>
        );
      }
      // Totals and CO₂ in euros are in the supplier profile; the cell keeps value and points.
      const second = !row.points ? "" : `${formatNumber(row.points[c], 0)} pts${!benchmarks && row.points[c] === 100 ? " · best" : ""}`;
      const pointsValue = row.points?.[c] ?? null;
      const secondHint = benchmarks
        ? `${versusBenchmark(c, evidence.value, benchmarks[c].value)} than today (${benchmarkValue(c, benchmarks[c].value)})`.replace("same as today than today", "the same as today")
        : null;
      // Slim matrix (10 Nov 2026): the "as of" date is in the source panel; old data keeps a warning icon here.
      const age = row.ageWarnings.find((w) => (c === "price" ? w.startsWith("Price") : c === "co2" ? w.startsWith("CO₂") : false));
      const oldIcon = age ? (
        <Tooltip title={`${age}. Older than the limit set by the Scope 3 manager; the score is unchanged.`}>
          <WarningOutlined aria-label="old data" className="as-of-old" style={{ marginInlineStart: 4 }} />
        </Tooltip>
      ) : null;
      return (
        <Button
          type="text"
          onClick={() => onOpen(evidence)}
          aria-label={`Show source: ${label}`}
          className={evidence.evidenceId === selectedId ? "cell-selected" : undefined}
          // Padding gives the hover background room around the text; the negative margin keeps the text in place (feedback 17 Nov 2026).
          style={{ height: "auto", padding: "2px 6px", margin: "-2px -6px", textAlign: "right" }}
        >
          <Flex vertical align="end">
            <span>
              {mainValue(c, evidence.value)}
              {oldIcon}
            </span>
            {second && pointsValue !== null && (benchmarks ? <PointsLine points={pointsValue} hint={secondHint} /> : (
              <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{second}</Typography.Text>
            ))}
            {c === "co2" && evidence.sourceBadge && <PcfBadgeTag badge={evidence.sourceBadge} style={{ marginTop: 2, marginInlineEnd: 0 }} />}
          </Flex>
        </Button>
      );
    },
  });

  const hasNotes = (row: Row) =>
    Boolean(row.exclusion) || row.notes.length > 0 || row.ageWarnings.some((w) => w.startsWith("Price"));
  const renderNotes = (row: Row) => (
            // Notes as small text lines with an icon instead of grey boxes (16 Nov 2026): lighter under the name.
            <Flex vertical gap={2} align="flex-start">
              {row.exclusion && (
                <Tooltip title={row.exclusion}>
                  <span className="matrix-note" tabIndex={0}>
                    <StopOutlined aria-hidden /> {knockOutLabel(row.exclusion.replace(/^EXCLUDED: /, ""))}
                  </span>
                </Tooltip>
              )}
              {/* An excluded offer shows only its knock-out reason; its other warnings are in the offer side panel. */}
              {!row.exclusion && (() => {
                const max = 3;
                const shown = row.notes.length > max + 1 ? row.notes.slice(0, max) : row.notes;
                const rest = row.notes.slice(shown.length);
                return (
                  <>
                    {shown.map((n) => (
                      <Tooltip key={n} title={n}>
                        <span className="matrix-note" tabIndex={0}>
                          <WarningOutlined aria-hidden /> {shortNote(n)}
                        </span>
                      </Tooltip>
                    ))}
                    {rest.length > 0 && (
                      <Tooltip title={<ul style={{ margin: 0, paddingLeft: 16 }}>{rest.map((n) => <li key={n}>{n}</li>)}</ul>}>
                        <span className="matrix-note" tabIndex={0}>+{rest.length} more</span>
                      </Tooltip>
                    )}
                    {/* An outdated or only indicative price: ask the supplier directly (e-mail draft, 16 Nov 2026). */}
                    {(row.ageWarnings.some((w) => w.startsWith("Price")) || row.notes.some((n) => /indicative price/i.test(n))) && (
                      <Button
                        type="link"
                        size="small"
                        icon={<MailOutlined />}
                        href={priceRequestMailto(run, row.supplierId, supplierNames[row.supplierId] ?? row.supplierId, partName)}
                        style={{ padding: 0, height: "auto", fontSize: 12 }}
                        aria-label={`Request a current price from ${supplierNames[row.supplierId] ?? row.supplierId}`}
                      >
                        Request price
                      </Button>
                    )}
                  </>
                );
              })()}
            </Flex>
          
  );

  const supplierCell = (row: Row, withNotes: boolean) => (
    <Flex vertical gap={4} align="flex-start">
      <Button
        type="link"
        size="small"
        onClick={() => onOpenSupplier(row.supplierId)}
        aria-label={`Open profile of ${supplierNames[row.supplierId] ?? row.supplierId}`}
        style={{ padding: 0, height: "auto", justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal" }}
      >
        <Typography.Text style={{ color: "inherit" }}>{supplierNames[row.supplierId] ?? row.supplierId}</Typography.Text>
      </Button>
      {withNotes && hasNotes(row) && renderNotes(row)}
    </Flex>
  );

  const columns: TableColumnsType<Row> = [
        { title: <span title="Rank" aria-label="Rank">#</span>, key: "rank", width: 40, render: (_, row) => (row.rank === null ? "—" : row.rank) },
        {
          title: "Supplier",
          key: "supplier",
          render: (_, row) => supplierCell(row, false),
        },
        {
          // Score against today (18 Nov 2026): the number on a soft background in its band colour.
          title: <Tooltip title="Weighted average of how many % better or worse the offer is than today on each criterion, up to 50 % either way. Green from 5 % better, red from 5 % worse, yellow in between.">vs today</Tooltip>,
          key: "score",
          align: "right",
          width: 124,
          render: (_, row) =>
            row.score === null ? (
              "—"
            ) : row.scoreRange ? (
              <Tooltip
                title={`Never delivered to us, so quality and delivery are a range: ${formatVsToday(row.scoreRange.low)} with the weakest values of our current suppliers, up to ${formatVsToday(row.scoreRange.high).replace(/^Same/, "the same")} with their best. It is ranked after all offers with real data.`}
              >
                <span
                  className={`score-pill score-${scoreBand(row.scoreRange.low)}`}
                  role="img"
                  tabIndex={0}
                  aria-label={`${formatVsTodayRange(row.scoreRange.low, row.scoreRange.high)} than today`}
                >
                  {formatVsTodayRange(row.scoreRange.low, row.scoreRange.high)}
                </span>
              </Tooltip>
            ) : (
              <Tooltip title={`${formatVsToday(row.score, 1)} · ${SCORE_BAND_LABEL[scoreBand(row.score)]}`}>
                <span
                  className={`score-pill score-${scoreBand(row.score)}`}
                  role="img"
                  tabIndex={0}
                  aria-label={`${formatVsToday(row.score)}, ${SCORE_BAND_LABEL[scoreBand(row.score)]}`}
                >
                  {formatVsTodayShort(row.score)}
                </span>
              </Tooltip>
            ),
        },
        ...CRITERIA.map(criterionColumn),
        {
          title: "Notes",
          key: "notes",
          render: (_, row) => renderNotes(row),
        },
  ];

  // Phones: one card per offer with the four criteria in a grid, same cells and same sources (10 Nov 2026).
  if (isPhone) {
    const cell = (key: string, row: Row, i: number) => {
      const col = columns.find((x) => x.key === key);
      return col && "render" in col && col.render ? (col.render(undefined, row, i) as ReactNode) : null;
    };
    return (
      <Flex vertical gap={8} style={{ padding: 12 }}>
        {rows.map((row, i) => (
          <div key={row.key} className={`offer-card${row.rank === 1 ? " offer-recommended" : ""}`}>
            <Flex justify="space-between" align="center" gap={8}>
              <Flex align="baseline" gap={6} style={{ minWidth: 0 }}>
                {/* The rank never shrinks, so "1." stays on one line next to a long supplier name (review 16 Nov 2026). */}
                <Typography.Text strong style={{ flex: "none", whiteSpace: "nowrap" }}>
                  {row.rank === null ? "—" : `${row.rank}.`}
                </Typography.Text>
                {cell("supplier", row, i)}
              </Flex>
              <div style={{ minWidth: 92 }}>{cell("score", row, i)}</div>
            </Flex>
            {row.points && (
              <div className="offer-criteria" style={{ marginTop: 6 }}>
                {CRITERIA.map((c) => (
                  <Flex key={c} vertical>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {HEADERS[c]}
                    </Typography.Text>
                    {cell(c, row, i)}
                  </Flex>
                ))}
              </div>
            )}
            {(row.notes.length > 0 || row.exclusion) && <div style={{ marginTop: 6 }}>{cell("notes", row, i)}</div>}
          </div>
        ))}
      </Flex>
    );
  }

  return (
    <Table<Row>
      size="small"
      pagination={false}
      dataSource={rows}
      rowClassName={(row) => (row.rank === 1 ? "row-recommended" : row.exclusion ? "row-excluded" : "")}
      tableLayout="fixed"
      // Below 1280 the matrix scrolls inside its card (globals.css); at 1440 nothing changes.
      className="matrix-table"
      columns={columns
        .filter((col) => col.key !== "notes")
        .map((col) => (col.key === "supplier" ? { ...col, render: (_: unknown, row: Row) => supplierCell(row, true) } : col))}
    />
  );
}
