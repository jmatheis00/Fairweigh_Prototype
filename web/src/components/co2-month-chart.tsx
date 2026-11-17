"use client";

import { Flex, Typography } from "antd";
import { useState } from "react";
import type { PurchaseStats } from "@scc/shared";
import { formatNumber } from "@/lib/labels";
import { BRAND } from "@/lib/theme";

/**
 * t CO₂e purchased per month, stacked by product. Three shades of the pitch palette
 * (design v4, review 16 Nov 2026): dark petrol (aluminium), accent teal (copper),
 * light teal (steel); no amber or blue. Neighbouring segments differ clearly in
 * lightness and are separated by a 2px gap; the light teal is below 3:1 contrast,
 * so a legend and the order table carry the values as well.
 * Colour follows the product, never its rank.
 */
export const PART_COLOR: Record<string, string> = {
  "P-ALU-HSG-01": BRAND.primary,
  "P-CU-WIRE-01": BRAND.secondary,
  "P-STL-HSG-01": BRAND.chartLight,
};
/** Stacking order from the bottom; the validation above holds for this order. */
export const PART_ORDER = ["P-ALU-HSG-01", "P-CU-WIRE-01", "P-STL-HSG-01"];
const colorOf = (partId: string) => PART_COLOR[partId] ?? BRAND.textTertiary;

// Wide drawing area: the chart fills the card width at about 1:1, so text stays at its real size.
const W = 1000;
const H = 180;
const M = { top: 10, right: 8, bottom: 22, left: 32 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  stats: PurchaseStats;
  parts: { partId: string; label: string }[];
  /** Month in which the Fairweigh decisions took effect, e.g. "2026-07". */
  decisionMonth: string | null;
}

export function Co2MonthChart({ stats, parts, decisionMonth }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = stats.monthly.map((m) => parts.reduce((a, p) => a + (m.byPart[p.partId] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const step = max > 60 ? 20 : max > 30 ? 10 : 5;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const y = (v: number) => M.top + PLOT_H - (v / top) * PLOT_H;
  const slot = PLOT_W / stats.monthly.length;
  const barW = Math.min(44, slot * 0.55);
  const decisionIndex = decisionMonth ? stats.monthly.findIndex((m) => m.month === decisionMonth) : -1;

  return (
    <div className="viz-root" style={{ position: "relative" }}>
      <Flex gap={14} wrap style={{ fontSize: 12, marginBottom: 4 }} role="list" aria-label="Legend">
        {parts.map((p) => (
          <Flex key={p.partId} align="center" gap={6} role="listitem">
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(p.partId) }} />
            <span>{p.label}</span>
          </Flex>
        ))}
      </Flex>
      <svg
        className="chart-wide"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block" }}
        role="img"
        aria-label={`t CO₂e purchased per month: ${stats.monthly.map((m, i) => `${m.month} ${formatNumber(totals[i]!, 1)} t`).join(", ")}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={BRAND.border} />
            <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={BRAND.textSecondary}>
              {t}
            </text>
          </g>
        ))}
        {decisionIndex > 0 && (
          <g>
            <line
              x1={M.left + slot * decisionIndex}
              x2={M.left + slot * decisionIndex}
              y1={M.top}
              y2={M.top + PLOT_H}
              stroke={BRAND.textSecondary}
              strokeDasharray="3 3"
            />
            <text x={M.left + slot * decisionIndex + 4} y={M.top + 9} fontSize={11} fill={BRAND.textSecondary}>
              Fairweigh decisions take effect
            </text>
          </g>
        )}
        {stats.monthly.map((m, i) => {
          const cx = M.left + slot * i + slot / 2;
          let acc = 0;
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${m.month}: ${formatNumber(totals[i]!, 1)} t CO₂e`}>
              {/* Hit target larger than the bar. */}
              <rect x={M.left + slot * i} y={M.top} width={slot} height={PLOT_H} fill="transparent" />
              {parts.map((p, k) => {
                const v = m.byPart[p.partId] ?? 0;
                if (v <= 0) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const isTop = parts.slice(k + 1).every((q) => (m.byPart[q.partId] ?? 0) <= 0);
                // 2px surface gap between stacked segments; 4px rounding only on the top end.
                const h = Math.max(0, y0 - y1 - (isTop ? 0 : 2));
                return isTop ? (
                  <path
                    key={p.partId}
                    d={`M${cx - barW / 2},${y0} V${y1 + 4} Q${cx - barW / 2},${y1} ${cx - barW / 2 + 4},${y1} H${cx + barW / 2 - 4} Q${cx + barW / 2},${y1} ${cx + barW / 2},${y1 + 4} V${y0} Z`}
                    fill={colorOf(p.partId)}
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ) : (
                  <rect key={p.partId} x={cx - barW / 2} y={y1 + 2} width={barW} height={h} fill={colorOf(p.partId)} opacity={hover === null || hover === i ? 1 : 0.45} />
                );
              })}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill={BRAND.textSecondary}>
                {MONTH[Number(m.month.slice(5)) - 1]}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="chart-tooltip"
          style={{ left: `${((M.left + slot * hover + slot / 2) / W) * 100}%` }}
          role="status"
        >
          <Typography.Text strong style={{ fontSize: 12 }}>
            {MONTH[Number(stats.monthly[hover]!.month.slice(5)) - 1]} {stats.monthly[hover]!.month.slice(0, 4)} · {formatNumber(totals[hover]!, 1)} t
          </Typography.Text>
          {parts.map((p) => (
            <Flex key={p.partId} align="center" gap={6} style={{ fontSize: 12 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(p.partId) }} />
              <span>
                {p.label}: {formatNumber(stats.monthly[hover]!.byPart[p.partId] ?? 0, 1)} t
              </span>
            </Flex>
          ))}
        </div>
      )}
    </div>
  );
}
