"use client";

import { Flex, Typography } from "antd";
import { useState } from "react";
import { verifiedEvidence, type AgentRun, type DecisionResult } from "@scc/shared";
import { formatNumber, formatEur } from "@/lib/labels";
import { shortName } from "@/lib/names";

/**
 * Positioning map: price per piece (x) against CO₂ per piece (y).
 * One series in one colour; identity comes from direct labels. The shaded
 * corner (below both averages) is "cheaper and lower in CO₂". The averages
 * only help reading; they are not a rule.
 */

// Wide and flat (16 Nov 2026): the right column is wider since the matrix got narrower; the height stays so
// the cockpit fits 1440 × 900 without scrolling, and the labels get more room.
const W = 580;
const H = 222;
const M = { top: 12, right: 12, bottom: 36, left: 40 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

interface Point {
  supplierId: string;
  name: string;
  price: number;
  co2: number;
  badge: string | null;
  score: number | null;
  rank: number | null;
  excluded: boolean;
}

/** Rounded axis limits with a little air, and about 4 ticks. */
function niceScale(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const rawStep = span / 3;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= rawStep) ?? rawStep;
  const lo = Math.floor((min - span * 0.12) / step) * step;
  const hi = Math.ceil((max + span * 0.12) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  // Enough decimals that neighbouring ticks never read the same (e.g. 1.5 / 2 / 2.5 €, not 2 / 2 / 2).
  const decimals = [0, 1, 2].find((d) => Math.abs(step * 10 ** d - Math.round(step * 10 ** d)) < 1e-6) ?? 2;
  return { lo, hi, ticks, decimals };
}

interface Props {
  run: AgentRun;
  result: DecisionResult;
  supplierNames: Record<string, string>;
  currentSupplierId: string | null;
  onSelectSupplier: (supplierId: string) => void;
}

export function PositioningMap({ run, result, supplierNames, currentSupplierId, onSelectSupplier }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const points: Point[] = [];
  const notShown: string[] = [];
  for (const supplierId of run.request.supplierIds) {
    const price = verifiedEvidence(run, supplierId, "price");
    const co2 = verifiedEvidence(run, supplierId, "co2");
    const name = shortName(supplierNames[supplierId] ?? supplierId);
    if (typeof price?.value !== "number" || typeof co2?.value !== "number") {
      notShown.push(name);
      continue;
    }
    const ranked = result.ranked.find((r) => r.supplierId === supplierId);
    points.push({
      supplierId,
      name,
      price: price.value,
      co2: co2.value,
      badge: co2.sourceBadge,
      score: ranked?.score ?? null,
      rank: ranked?.rank ?? null,
      excluded: result.excluded.some((x) => x.supplierId === supplierId),
    });
  }
  if (points.length === 0) {
    return <Typography.Text type="secondary">No offer has a verified price and CO₂ value.</Typography.Text>;
  }

  const xs = niceScale(points.map((p) => p.price));
  const ys = niceScale(points.map((p) => p.co2));
  const x = (v: number) => M.left + ((v - xs.lo) / (xs.hi - xs.lo)) * PLOT_W;
  const y = (v: number) => M.top + PLOT_H - ((v - ys.lo) / (ys.hi - ys.lo)) * PLOT_H;

  const scored = points.filter((p) => !p.excluded);
  const avgPrice = scored.reduce((s, p) => s + p.price, 0) / (scored.length || 1);
  const avgCo2 = scored.reduce((s, p) => s + p.co2, 0) / (scored.length || 1);
  const recommendedId = result.recommendation?.supplierId;
  const hovered = points.find((p) => p.supplierId === hover);

  const tagOf = (p: Point) =>
    p.excluded ? " · excluded" : p.supplierId === recommendedId ? " · recommended" : p.supplierId === currentSupplierId ? " · current" : "";

  // Label positions: left of points in the right part. Each label is treated as a box (estimated from its text
  // length), and a label that would touch an earlier one moves to the nearest free line above or below (16 Nov 2026).
  const LINE = 14;
  const labelPos = new Map<string, { lx: number; ly: number; left: boolean }>();
  const boxes: { x0: number; x1: number; ly: number }[] = [];
  const dots = points.map((p) => ({ id: p.supplierId, cx: x(p.price), cy: y(p.co2) }));
  for (const p of [...points].sort((a, b) => y(a.co2) - y(b.co2))) {
    const cx = x(p.price);
    const width = (p.name.length + tagOf(p).length) * 6.6;
    const fitsRight = cx + 12 + width <= W;
    const fitsLeft = cx - 12 - width >= 0;
    // Right of the point unless it is in the right part or would run past the edge. A label that fits on neither
    // side goes on a line above or below the point, shifted to stay inside the chart.
    const left = fitsLeft && (cx > M.left + PLOT_W * 0.6 || !fitsRight);
    const beside = fitsLeft || fitsRight;
    const lx = beside ? (left ? cx - 12 : cx + 12) : Math.max(4, Math.min(cx - width / 2, W - 4 - width));
    const [x0, x1] = left ? [lx - width, lx] : [lx, lx + width];
    // A line is free when it stays in the plot and touches neither an earlier label nor another supplier's dot.
    const free = (ly: number) =>
      ly >= M.top + 10 &&
      ly <= M.top + PLOT_H - 2 &&
      !boxes.some((b) => b.x0 < x1 && x0 < b.x1 && Math.abs(b.ly - ly) < LINE) &&
      !dots.some((d) => d.id !== p.supplierId && d.cx + 7 > x0 && d.cx - 7 < x1 && d.cy + 7 > ly - 11 && d.cy - 7 < ly + 3);
    const base = y(p.co2) + 4;
    const offsets = [0, ...Array.from({ length: 8 }, (_, i) => [-(i + 1) * LINE, (i + 1) * LINE]).flat()].filter((o) => beside || o !== 0);
    const ly = base + (offsets.find((o) => free(base + o)) ?? offsets[0]);
    boxes.push({ x0, x1, ly });
    labelPos.set(p.supplierId, { lx, ly, left });
  }

  return (
    <Flex vertical gap={4} className="viz-root">
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Positioning map of the offers by price and CO₂ per piece">
          {/* The corner below both averages: cheaper and lower in CO₂ */}
          <rect x={M.left} y={y(avgCo2)} width={x(avgPrice) - M.left} height={M.top + PLOT_H - y(avgCo2)} className="viz-sweet" />
          <text x={M.left + 6} y={M.top + PLOT_H - 6} className="viz-sweet-label">
            Cheaper · lower CO₂
          </text>

          {xs.ticks.map((t) => (
            <g key={`x${t}`}>
              <line x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + PLOT_H} className="viz-grid" />
              <text x={x(t)} y={M.top + PLOT_H + 14} textAnchor="middle" className="viz-tick">
                {formatNumber(t, xs.decimals)}
              </text>
            </g>
          ))}
          {ys.ticks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} className="viz-grid" />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end" className="viz-tick">
                {formatNumber(t, ys.decimals)}
              </text>
            </g>
          ))}
          <text x={M.left + PLOT_W} y={H - 4} textAnchor="end" className="viz-axis-label">
            Price per piece (€) →
          </text>
          <text x={10} y={M.top} transform={`rotate(-90 10 ${M.top})`} textAnchor="end" className="viz-axis-label">
            CO₂ per piece (kg) →
          </text>

          <line x1={x(avgPrice)} x2={x(avgPrice)} y1={M.top} y2={M.top + PLOT_H} className="viz-average" />
          <line x1={M.left} x2={M.left + PLOT_W} y1={y(avgCo2)} y2={y(avgCo2)} className="viz-average" />

          {points.map((p) => {
            const cx = x(p.price);
            const cy = y(p.co2);
            const recommended = p.supplierId === recommendedId;
            const current = p.supplierId === currentSupplierId;
            const label = labelPos.get(p.supplierId)!;
            const tag = tagOf(p);
            return (
              <g
                key={p.supplierId}
                role="button"
                tabIndex={0}
                aria-label={`${p.name}: ${formatEur(p.price, 2)} and ${formatNumber(p.co2, 1)} kg CO₂ per piece${p.excluded ? ", excluded" : `, score ${formatNumber(p.score ?? 0, 0)}`}. Open profile`}
                onMouseEnter={() => setHover(p.supplierId)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p.supplierId)}
                onBlur={() => setHover(null)}
                onClick={() => onSelectSupplier(p.supplierId)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelectSupplier(p.supplierId)}
                style={{ cursor: "pointer" }}
              >
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                {p.excluded ? (
                  <path d={`M${cx - 5},${cy - 5} L${cx + 5},${cy + 5} M${cx + 5},${cy - 5} L${cx - 5},${cy + 5}`} className="viz-excluded" />
                ) : (
                  <circle cx={cx} cy={cy} r={recommended ? 7 : 5} className={recommended ? "viz-dot viz-dot-recommended" : "viz-dot"} />
                )}
                {current && <circle cx={cx} cy={cy} r={10} className="viz-current" />}
                <text
                  x={label.lx}
                  y={label.ly}
                  textAnchor={label.left ? "end" : "start"}
                  className={recommended ? "viz-label viz-label-strong" : "viz-label"}
                >
                  {p.name}
                  <tspan className="viz-label-tag">{tag}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="viz-tooltip" style={{ left: `${(x(hovered.price) / W) * 100}%`, top: `${(y(hovered.co2) / H) * 100}%` }}>
            <strong>{supplierNames[hovered.supplierId] ?? hovered.name}</strong>
            <div>{formatEur(hovered.price, 2)} per piece</div>
            <div>
              {formatNumber(hovered.co2, 1)} kg CO₂e per piece{hovered.badge ? ` (${hovered.badge})` : ""}
            </div>
            <div>{hovered.excluded ? "Excluded by a knock-out rule" : `Rank ${hovered.rank} · ${formatNumber(hovered.score ?? 0, 0)} points`}</div>
          </div>
        )}
      </div>
      {notShown.length > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Not shown (no verified price or CO₂): {notShown.join(", ")}.
        </Typography.Text>
      )}
    </Flex>
  );
}

/** Tooltip text next to the map title. */
export const MAP_TIP = "Dashed lines: average of the scored offers. Ring: current supplier. Click a point for its profile.";
