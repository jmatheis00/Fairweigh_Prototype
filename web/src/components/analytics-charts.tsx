"use client";

import { CheckCircleOutlined } from "@ant-design/icons";
import { Descriptions, Flex, Table, Tag, Tooltip, Typography } from "antd";
import type { AbatementOption, Co2TrendPoint, SupplierBasePoint, SupplierQuadrant } from "@scc/shared";
import { formatMonth, formatNumber, formatEur } from "@/lib/labels";
import { BRAND } from "@/lib/theme";

const TEAL = BRAND.secondary;
const PETROL = BRAND.primary;
const GREY = BRAND.textTertiary;
const GRID = BRAND.border;
const INK = BRAND.text;
const MUTED = BRAND.textSecondary;

/* ------------------------------------------------------------------ */

/** A tiny trend line for a KPI tile; the tile carries the numbers, this only shows the direction. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const W = 84;
  const H = 26;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={TEAL} strokeWidth="1.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */

const QUADRANT_TEXT: Record<SupplierQuadrant, string> = {
  "Switch candidate": "High spend, more CO₂ per € than the category: look for alternatives",
  Keep: "High spend, less CO₂ per € than the category",
  Watch: "Lower spend, more CO₂ per € than the category",
  Fine: "Lower spend, less CO₂ per € than the category",
};

/** The chart's facts for one supplier, shown at the top of the supplier side panel (no hover tooltip, 19 Nov 2026). */
export function SupplierBaseFacts({ point }: { point: SupplierBasePoint }) {
  const sign = point.versusAveragePercent > 0 ? "+" : "";
  return (
    <Descriptions
      size="small"
      column={1}
      bordered
      title={`Against the category ${point.category} · last 12 months`}
      items={[
        { label: "Spend", children: `${formatEur(point.spendEur, 0)} (client ERP)` },
        { label: "CO₂ per €", children: `${formatNumber(point.intensityKgPerEur, 3)} kg CO₂e (rating partner)` },
        { label: "Category average", children: `${formatNumber(point.categoryAverageKgPerEur, 3)} kg CO₂e per € (${sign}${point.versusAveragePercent} %)` },
        { label: "CO₂ bought", children: `about ${formatNumber(point.co2Tonnes, 0)} t CO₂e` },
        { label: "Position", children: <><strong>{point.quadrant}</strong>: {QUADRANT_TEXT[point.quadrant]}</> },
      ]}
    />
  );
}

/**
 * Current suppliers: spend (x) against CO₂ intensity versus the category average (y).
 * Bubble area = estimated CO₂ bought. Quadrants split at the median spend and at the average.
 */
export function SupplierBaseMap({
  points,
  medianSpendEur,
  name,
  onOpen,
}: {
  points: SupplierBasePoint[];
  medianSpendEur: number;
  name: (supplierId: string) => string;
  onOpen?: (supplierId: string) => void;
}) {
  const W = 1200;
  const H = 300;
  const M = { l: 60, r: 16, t: 14, b: 36 };
  const maxSpend = Math.max(...points.map((p) => p.spendEur)) * 1.08;
  const yMax = Math.max(60, Math.ceil(Math.max(...points.map((p) => p.versusAveragePercent)) / 20) * 20);
  const yMin = Math.min(-60, Math.floor(Math.min(...points.map((p) => p.versusAveragePercent)) / 20) * 20);
  const maxCo2 = Math.max(...points.map((p) => p.co2Tonnes));
  const x = (v: number) => M.l + (v / maxSpend) * (W - M.l - M.r);
  const y = (v: number) => M.t + ((yMax - v) / (yMax - yMin)) * (H - M.t - M.b);
  const r = (t: number) => 4 + Math.sqrt(t / maxCo2) * 18;
  const yTicks = Array.from({ length: Math.floor((yMax - yMin) / 20) + 1 }, (_, i) => yMin + i * 20).filter((v) => v % 40 === 0);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxSpend);

  return (
    <div style={{ position: "relative" }}>
      <svg className="chart-wide" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Current suppliers: spend against CO₂ intensity versus the category average">
        {/* Switch-candidate quadrant: high spend, above the average */}
        <rect x={x(medianSpendEur)} y={M.t} width={W - M.r - x(medianSpendEur)} height={y(0) - M.t} fill={BRAND.tint} />
        <text x={W - M.r - 6} y={M.t + 14} fontSize="12" textAnchor="end" fill={PETROL} fontWeight={600}>
          Switch candidates
        </text>
        <text x={W - M.r - 6} y={H - M.b - 8} fontSize="12" textAnchor="end" fill={MUTED}>
          Keep
        </text>
        <text x={M.l + 6} y={M.t + 14} fontSize="12" fill={MUTED}>
          Watch
        </text>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? GREY : GRID} strokeDasharray={v === 0 ? "4 3" : undefined} />
            <text x={M.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill={MUTED}>
              {v > 0 ? "+" : ""}
              {v} %
            </text>
          </g>
        ))}
        <line x1={x(medianSpendEur)} x2={x(medianSpendEur)} y1={M.t} y2={H - M.b} stroke={GREY} strokeDasharray="4 3" />
        {xTicks.map((v, i) => (
          <text key={i} x={x(v)} y={H - M.b + 16} fontSize="11" textAnchor={i === 0 ? "start" : "middle"} fill={MUTED}>
            {formatNumber(v / 1_000_000, 1)}m €
          </text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 4} fontSize="11" textAnchor="middle" fill={MUTED}>
          Spend last 12 months (client ERP) · dashed line: median
        </text>
        <text x={14} y={(M.t + H - M.b) / 2} fontSize="11" textAnchor="middle" fill={MUTED} transform={`rotate(-90 14 ${(M.t + H - M.b) / 2})`}>
          CO₂ per € vs category average
        </text>
        {[...points].sort((a, b) => b.co2Tonnes - a.co2Tonnes).map((p) => (
          <circle
            key={p.supplierId}
            cx={x(p.spendEur)}
            cy={y(p.versusAveragePercent)}
            r={r(p.co2Tonnes)}
            fill={p.quadrant === "Switch candidate" ? PETROL : TEAL}
            fillOpacity={p.quadrant === "Switch candidate" ? 0.8 : 0.35}
            stroke={BRAND.white}
            strokeWidth="1"
            style={{ cursor: onOpen ? "pointer" : "default" }}
            onClick={() => onOpen?.(p.supplierId)}
            onKeyDown={(e) => {
              if (onOpen && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onOpen(p.supplierId);
              }
            }}
            tabIndex={0}
            aria-label={`${name(p.supplierId)}: ${formatEur(p.spendEur, 0)}, ${p.versusAveragePercent > 0 ? "+" : ""}${p.versusAveragePercent} % vs category, ${p.quadrant}`}
          />
        ))}
        {[...points]
          .filter((p) => p.quadrant === "Switch candidate")
          .sort((a, b) => b.co2Tonnes - a.co2Tonnes)
          .slice(0, 5)
          .sort((a, b) => a.spendEur - b.spendEur)
          .map((p, i) => (
            <text
              key={`l-${p.supplierId}`}
              x={x(p.spendEur)}
              // Alternate above and below the bubble, so neighbours do not overlap.
              y={i % 2 === 0 ? y(p.versusAveragePercent) - r(p.co2Tonnes) - 4 : y(p.versusAveragePercent) + r(p.co2Tonnes) + 12}
              fontSize="11"
              textAnchor="middle"
              fill={INK}
            >
              {name(p.supplierId)}
            </text>
          ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Purchased CO₂ per month against the target path (dashed). */
export function Co2TargetChart({ points }: { points: Co2TrendPoint[] }) {
  if (points.length < 2) return null;
  const W = 1200;
  const H = 180;
  const M = { l: 44, r: 12, t: 12, b: 26 };
  const max = Math.max(...points.flatMap((p) => [p.actualTonnes, p.targetTonnes])) * 1.1;
  const x = (i: number) => M.l + (i / (points.length - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - v / max) * (H - M.t - M.b);
  const line = (key: "actualTonnes" | "targetTonnes") => points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <svg className="chart-wide" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Purchased CO₂ per month against the target path">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={GRID} />
          <text x={M.l - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill={MUTED}>
            {formatNumber(v, 0)}
          </text>
        </g>
      ))}
      <polyline points={line("targetTonnes")} fill="none" stroke={GREY} strokeWidth="2" strokeDasharray="6 4" />
      <polyline points={line("actualTonnes")} fill="none" stroke={TEAL} strokeWidth="2.2" />
      {points.map((p, i) => (
        <Tooltip key={p.month} title={`${formatMonth(`${p.month}-01`)}: ${formatNumber(p.actualTonnes, 1)} t, target ${formatNumber(p.targetTonnes, 1)} t`}>
          <circle cx={x(i)} cy={y(p.actualTonnes)} r="3.5" fill={TEAL} tabIndex={0} />
        </Tooltip>
      ))}
      {points.map((p, i) =>
        i % 3 === 0 || i === points.length - 1 ? (
          <text key={`m-${p.month}`} x={x(i)} y={H - 6} fontSize="11" textAnchor="middle" fill={MUTED}>
            {formatMonth(`${p.month}-01`)}
          </text>
        ) : null,
      )}
      <text x={W - M.r} y={y(points.at(-1)!.targetTonnes) - 8} fontSize="11" textAnchor="end" fill={MUTED}>
        target path
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */

/** Supplier switches as horizontal bars: EUR per tonne CO₂ avoided; left of zero saves money too. */
/**
 * Next best actions as a table (feedback 17 Nov 2026): one row per switch, cheapest CO₂ first.
 * A table instead of bars, because a switch at the same price has 0 € per tonne and its bar looked empty.
 */
export function AbatementTable({ options, name, part }: { options: AbatementOption[]; name: (id: string) => string; part: (id: string) => string }) {
  return (
    <Table<AbatementOption>
      size="small"
      pagination={false}
      rowKey={(o) => `${o.partId}-${o.toSupplierId}`}
      dataSource={options}
      locale={{ emptyText: "No switch avoids CO₂ against today's suppliers." }}
      scroll={{ x: 720 }}
      aria-label="Supplier switches by cost per tonne CO₂ avoided"
      columns={[
        {
          title: "Switch",
          key: "s",
          render: (_, o) => (
            <Flex vertical>
              <span>
                <strong>{part(o.partId)}</strong>: {name(o.fromSupplierId)} → {name(o.toSupplierId)}
              </span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                at {formatNumber(o.annualQuantity, 0)} pcs per year · CO₂ data: {o.badge}
              </Typography.Text>
            </Flex>
          ),
        },
        {
          title: "Cost per t CO₂ avoided",
          key: "pt",
          align: "right",
          width: 180,
          render: (_, o) =>
            Math.round(o.costPerTonneEur) === 0 ? (
              "no extra cost"
            ) : o.costPerTonneEur < 0 ? (
              <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>
                saves {formatEur(Math.abs(o.costPerTonneEur), 0)}
              </Tag>
            ) : (
              formatEur(o.costPerTonneEur, 0)
            ),
        },
        { title: "CO₂ avoided per year", key: "t", align: "right", width: 160, render: (_, o) => `${formatNumber(o.avoidedTonnes, 1)} t` },
        {
          title: "Extra cost per year",
          key: "c",
          align: "right",
          width: 150,
          render: (_, o) => (o.extraCostEur === 0 ? "same price" : o.extraCostEur < 0 ? `saves ${formatEur(-o.extraCostEur, 0)}` : formatEur(o.extraCostEur, 0)),
        },
      ]}
    />
  );
}
