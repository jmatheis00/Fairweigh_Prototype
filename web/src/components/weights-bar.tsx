"use client";

import { CheckCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Flex, InputNumber, Slider, Typography } from "antd";
import { CRITERIA, DEFAULT_WEIGHTS, WEIGHT_MAX, WEIGHT_MIN, weightBounds, type Criterion, type WeightSensitivity, type Weights } from "@scc/shared";
import { TOPIC_LABEL } from "@/lib/labels";

interface Props {
  weights: Weights;
  /** Default weights of the product's category; "Reset" goes back to them. */
  defaults?: Weights;
  onChange: (weights: Weights) => void;
  /** Where the leader would change per criterion; shown as a mark on the slider. */
  sensitivity?: WeightSensitivity[];
  supplierLabel?: (supplierId: string) => string;
}

/** What each criterion measures, in the buyer's words. */
const HINT: Record<Criterion, string> = {
  quality: "fewer complaints",
  price: "lower price",
  co2: "less CO₂",
  delivery: "more on time",
};

export function weightSum(weights: Weights): number {
  return CRITERIA.reduce((s, c) => s + weights[c], 0);
}

/**
 * One slider and one number field per criterion. Each moves on its own, so
 * "quality 30 %, price 20 %" can be set directly. The ranking only updates
 * when the four add up to exactly 100 %.
 */
export function WeightsPanel({ weights, defaults = DEFAULT_WEIGHTS, onChange, sensitivity = [], supplierLabel = (id) => id }: Props) {
  const isDefault = CRITERIA.every((c) => weights[c] === defaults[c]);
  const equal = CRITERIA.every((c) => defaults[c] === 25);
  const sum = weightSum(weights);
  // 10–50 % per criterion (Sprint 3 expert interview, 18 Nov 2026).
  const bounds = weightBounds(defaults);
  // One scale for all four sliders (18 Nov 2026), so 22 % sits visibly left of 34 %.
  // At least 0–60 %; the allowed band is shaded and the handle stops at its ends.
  const scaleMax = Math.max(60, Math.ceil(Math.max(...CRITERIA.map((c) => bounds[c].max)) / 10) * 10);
  const pos = (v: number) => `${(100 * v) / scaleMax}%`;
  const set = (c: Criterion, v: number | null) => {
    if (v === null || !Number.isFinite(v)) return;
    onChange({ ...weights, [c]: Math.max(bounds[c].min, Math.min(bounds[c].max, Math.round(v))) });
  };

  return (
    <Flex vertical gap={4} className="weights-panel">
      {CRITERIA.map((c) => (
        <div
          key={c}
          title={(() => {
            const s = sensitivity.find((x) => x.criterion === c);
            return s?.flipsAt != null && s.newLeaderId
              ? `${TOPIC_LABEL[c]} (${HINT[c]}), allowed ${bounds[c].min}–${bounds[c].max} %: at ${s.direction === "up" ? "≥" : "≤"}${s.flipsAt} %, ${supplierLabel(s.newLeaderId)} takes the lead`
              : `${TOPIC_LABEL[c]} (${HINT[c]}), allowed ${bounds[c].min}–${bounds[c].max} %: the recommendation holds across the allowed range`;
          })()}
        >
          <Flex justify="space-between" align="center" gap={8}>
            <label htmlFor={`weight-input-${c}`}>
              <Typography.Text>{TOPIC_LABEL[c]}</Typography.Text>
              {(() => {
                // Only the note that helps the decision; hint and range are in the row tooltip.
                const s = sensitivity.find((x) => x.criterion === c);
                const inRange = s?.flipsAt != null && s.flipsAt >= bounds[c].min && s.flipsAt <= bounds[c].max;
                return inRange && s?.newLeaderId ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {" "}· leader changes at {s.direction === "up" ? "≥" : "≤"}
                    {s.flipsAt} %
                  </Typography.Text>
                ) : null;
              })()}
            </label>
            <InputNumber<number>
              id={`weight-input-${c}`}
              size="small"
              min={bounds[c].min}
              max={bounds[c].max}
              step={1}
              precision={0}
              suffix="%"
              value={weights[c]}
              onChange={(v) => set(c, v)}
              style={{ width: 78 }}
            />
          </Flex>
          <Slider
            // A small dot where the leader would change; the text is in the label line above.
            marks={(() => {
              const s = sensitivity.find((x) => x.criterion === c);
              return s?.flipsAt != null && s.flipsAt >= bounds[c].min && s.flipsAt <= bounds[c].max ? { [s.flipsAt]: " " } : undefined;
            })()}
            min={0}
            max={scaleMax}
            step={1}
            included={false}
            value={weights[c]}
            onChange={(v) => set(c, v)}
            tooltip={{ formatter: (v) => `${v} %` }}
            style={{ marginBlock: 2 }}
            styles={{
              rail: {
                background: `linear-gradient(to right, var(--surface-muted) ${pos(bounds[c].min)}, var(--weight-band) ${pos(bounds[c].min)} ${pos(bounds[c].max)}, var(--surface-muted) ${pos(bounds[c].max)})`,
              },
            }}
            aria-label={`Weight for ${TOPIC_LABEL[c]} in percent`}
          />
        </div>
      ))}
      <Flex justify="space-between" align="center" gap={8}>
        {sum === 100 ? (
          <Typography.Text style={{ fontSize: 13 }}>
            <CheckCircleOutlined /> Sum 100 %
          </Typography.Text>
        ) : (
          <Typography.Text type="warning" strong style={{ fontSize: 13 }}>
            <WarningOutlined /> Sum {sum} % · {sum > 100 ? `reduce by ${sum - 100} %` : `add ${100 - sum} %`}
          </Typography.Text>
        )}
        <Button size="small" disabled={isDefault} onClick={() => onChange(defaults)}>
          {equal ? "Reset to 25 % each" : "Reset to company default"}
        </Button>
      </Flex>
    </Flex>
  );
}

/** Tooltip text next to the weights panel title. */
export const WEIGHTS_TIP = `Company default per commodity group. Each weight can be set between ${WEIGHT_MIN} % and ${WEIGHT_MAX} % (the darker part of the slider). Any change to the default needs a justification in step 4 (Decide).`;
