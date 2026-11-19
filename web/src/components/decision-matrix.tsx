"use client";

import { CloseCircleOutlined, MailOutlined, MinusCircleOutlined, QuestionCircleOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Flex, Table, Tooltip, Typography, type TableColumnsType } from "antd";
import type { ReactNode } from "react";
import { useIsBelowLaptop } from "@/lib/use-phone";
import {
  CRITERIA,
  cellEvidence,
  percentBetter,
  type AgentRun,
  type Benchmarks,
  type NewSupplierAssumption,
  type Criterion,
  type DecisionResult,
  type Evidence,
} from "@scc/shared";
import { AGE_NOTE, SCORE_BAND_LABEL, knockOutLabel, TOPIC_LABEL, formatNumber, scoreBand, formatEur, formatVsToday, formatVsTodayShort, formatVsTodayRange, formatCriterionVsToday, formatCriterionRange, CRITERION_LIMIT, AS_TODAY, scorePillClass } from "@/lib/labels";
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
  /** Suppliers that never delivered to us (quote or new candidate): no ERP delivery or complaint figures can exist. */
  noDeliveries?: Set<string>;
  /** Weakest values of our current suppliers in the category, used for suppliers that never delivered. */
  assumption?: NewSupplierAssumption | null;
  /** Product name for the price request e-mail. */
  partName: string;
}

/** Without "today" values: what the points mean (the cap and missing-value rule are in "View details"). */
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
  quality: "Complaint rate from the ERP. Lower is better. Scored on the share of deliveries without a complaint.",
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
 * Change against today in the band colours of the "vs today" pill (19 Nov 2026, no icons): green from
 * 5 % better, red from 5 % worse, amber in between. The words "better"/"worse" always carry the meaning.
 * A value that rounds to today shows nothing (19 Nov 2026): the "vs today" pill of the row says it once;
 * screen readers still hear "same as today".
 */
function PointsLine({ points, hint }: { points: number; hint: string | null }) {
  const tone = points >= 55 ? "better" : points <= 45 ? "worse" : "same";
  const text = formatCriterionVsToday(points);
  if (text === AS_TODAY) return <span className="sr-only">Same as today</span>;
  return (
    <Tooltip title={hint}>
      <span
        className={`points-line score-number score-${tone}`}
        aria-label={`${text}, ${tone === "same" ? "about the same as" : `${tone} than`} today`}
      >
        {text}
      </span>
    </Tooltip>
  );
}

export function DecisionMatrix({ run, result, supplierNames, selectedId, onOpen, onOpenSupplier, benchmarks, noDeliveries, assumption, partName }: Props) {
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
              {benchmarks ? (
                <div>
                  <strong>Today {benchmarkValue(c, benchmarks[c].value)}:</strong> {benchmarks[c].basis.split(":")[0]}.{" "}
                  {benchmarks[c].sourceUrl && (
                    <a href={benchmarks[c].sourceUrl!} target="_blank" rel="noreferrer" style={{ color: BRAND.onDark }}>
                      Open source
                    </a>
                  )}
                </div>
              ) : (
                <div>{POINTS_HELP_RELATIVE}</div>
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
            title={`No delivery experience yet. Estimated from ${assumption.peers} current suppliers in this category: ${formatNumber(weak, decimals)} % (weakest) to ${formatNumber(best, decimals)} % (best). The ranking uses the weakest value.`}
          >
            <Flex vertical align="end" tabIndex={0} className="assumed-cell">
              <span>
                ≈ {formatNumber(Math.min(weak, best), decimals)}–{formatNumber(Math.max(weak, best), decimals)} %
              </span>
              {/* "0.4 % worse to 0.4 % better" is too wide for the column: one line per end ("up to 2 % better" stays one line). */}
              {formatCriterionRange(lo, hi)
                .split(/(?<!^up) (?=to )/)
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
                ? "No delivery experience yet, so no ERP figures. Counts as 50 % worse than today until a sample delivery is rated."
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
        ? `${versusBenchmark(c, evidence.value, benchmarks[c].value)} than today (${benchmarkValue(c, benchmarks[c].value)})`.replace("same as today than today", "the same as today") +
          (pointsValue !== null && (pointsValue <= 0 || pointsValue >= 100)
            ? `. Counts as ${CRITERION_LIMIT} % ${pointsValue <= 0 ? "worse" : "better"} in the score (limit).`
            : "")
        : null;
      // Slim matrix (10 Nov 2026): the "as of" date is in the source panel; old data keeps a warning icon here.
      const age = row.ageWarnings.find((w) => (c === "price" ? w.startsWith("Price") : c === "co2" ? w.startsWith("CO₂") : false));
      const oldIcon = age ? (
        <Tooltip title={`${age}. Past the limit set by the Scope 3 manager. The score is unchanged.`}>
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
                <Tooltip title={`${row.exclusion.replace(/^EXCLUDED: /, "")}.`}>
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
          title: <Tooltip title="Weighted average of the change against today on each criterion, capped at 50 %. Green: 5 % better or more. Red: 5 % worse or more. Yellow: in between. Grey: same as today.">vs today</Tooltip>,
          key: "score",
          align: "right",
          width: 124,
          render: (_, row) =>
            row.score === null ? (
              <span className="sr-only">No score</span>
            ) : row.scoreRange ? (
              <Tooltip
                title={`No delivery experience yet. Quality and delivery are estimated from current suppliers: ${formatVsToday(row.scoreRange.low).replace(/^Same/, "the same")} (weakest) to ${formatVsTodayShort(row.scoreRange.high) === AS_TODAY ? "the same as today" : formatVsTodayShort(row.scoreRange.high)} (best). Ranked below offers with real data.`}
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
              <Tooltip title={formatVsToday(row.score, 1)}>
                <span
                  className={`score-pill ${scorePillClass(row.score)}`}
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
