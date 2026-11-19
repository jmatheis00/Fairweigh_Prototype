"use client";

import { Modal, Typography } from "antd";
import { CRITERIA, WEIGHT_MAX, WEIGHT_MIN, type BuyerRules, type Weights } from "@scc/shared";
import { HowItWorks } from "./how-it-works";
import { SCORE_BAND_LABEL, TOPIC_LABEL, formatDateTime } from "@/lib/labels";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  rules: BuyerRules | null;
  /** Weights of the open comparison and the company default, if a comparison is open. */
  weights?: Weights | null;
  defaults?: Weights | null;
}

/** "How it works" from the help menu and "How is the score calculated?" from the recommendation. Mirrors PLAN.md section 3. */
export function ScoreHelp({ open, title, onClose, rules, weights, defaults }: Props) {
  return (
    // Wide, in two columns (19 Nov 2026): the whole help fits on a 1440 × 900 laptop without scrolling; one column on small screens.
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      cancelButtonProps={{ style: { display: "none" } }}
      okText="Close"
      title={title}
      width="min(1160px, calc(100vw - 32px))"
      style={{ top: 24 }}
    >
      <div className="help-columns">
        <div>
      <Typography.Paragraph>
        The ranking is fixed code, not AI. The AI only collects the evidence; code checks every value at its source. The recommendation is a
        suggestion: the buyer decides, and every decision is saved with the buyer&apos;s name in the Decision Log.
      </Typography.Paragraph>
      {weights && (
        <Typography.Paragraph>
          <strong>Weights in this comparison:</strong> {CRITERIA.map((c) => `${TOPIC_LABEL[c]} ${weights[c]} %`).join(", ")}
          {defaults && CRITERIA.some((c) => defaults[c] !== weights[c])
            ? ` (company default: ${CRITERIA.map((c) => `${TOPIC_LABEL[c]} ${defaults[c]} %`).join(", ")})`
            : " (company default)"}
          . Every value in the matrix opens its source.
        </Typography.Paragraph>
      )}
      <HowItWorks title={false} />
      {rules && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>
            Rules in force, set by the Scope 3 manager
          </Typography.Title>
          <ul style={{ paddingLeft: 20, lineHeight: 1.7, marginBottom: 4 }}>
            <li>Prices older than {rules.priceMaxAgeDays} days are flagged as outdated.</li>
            <li>CO₂ data older than {rules.co2MaxAgeDays} days is flagged as old.</li>
            <li>CO₂ price for the euro display: {rules.co2PricePerTonneEur} € per tonne.</li>
            <li>{rules.flagEstimatedCo2 ? "Estimated CO₂ values are flagged." : "Estimated CO₂ values are not flagged."}</li>
          </ul>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {rules.updatedBy && rules.updatedAt ? `Last changed by ${rules.updatedBy}, ${formatDateTime(rules.updatedAt)}.` : "Defaults, not changed yet."} These
            rules only add notes; they never change the score.
          </Typography.Text>
        </>
      )}
        </div>
        <div>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        The score in detail
      </Typography.Title>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <strong>Knock-outs first.</strong> An offer is excluded for a proven legal violation (fine notice), LkSG country risk High
          without a social audit (SA8000), or a known child or forced labour controversy. It stays visible, without a score. Other risks,
          controversies and long lead times are warnings.
        </li>
        <li>
          <strong>Percent per criterion against today.</strong> How many % better or worse a value is than today, capped at
          ±50 %. Quality counts the deliveries without a complaint (99.0 % vs 99.2 % is 0.2 % worse), delivery the deliveries on time,
          price and CO₂ less money and less CO₂. Today means the average of our last three purchases of the part
          in the client ERP: their unit price, and the quality, delivery and CO₂ figures of the suppliers we bought from. Without
          purchases, the current contract and the current supplier are used; without any value, the category average. Hover a column title to see the value and its source.
        </li>
        <li>
          <strong>Industry average as context.</strong> The published CO₂ average of the material (aluminium: IAI, steel: worldsteel,
          copper: ICA, rubber: OEKOBAUDAT) is shown next to the result, so you see whether even the best offer should improve. It covers
          the material only, so it does not count towards the score.
        </li>
        <li>
          <strong>Gaps never help.</strong> A missing or unverified value counts as 50 % worse and gets a visible notice. A supplier
          that never delivered gets a range for quality and delivery and is ranked after all offers with real data.
        </li>
        <li>
          <strong>Weighting.</strong> The weights (together 100 %) weight the four criteria: product quality, price, CO₂ and delivery
          reliability. The company sets a default per commodity group; the buyer may set each weight between {WEIGHT_MIN} % and{" "}
          {WEIGHT_MAX} % and must justify a change.
        </li>
        <li>
          <strong>Result.</strong> The weighted average, e.g. “9 % better than today” (at most 50 % either way). Colours:{" "}
          {SCORE_BAND_LABEL.better}, {SCORE_BAND_LABEL.same}, {SCORE_BAND_LABEL.worse}.
        </li>
      </ol>
      <Typography.Text type="secondary">CO₂ in euros is shown for information only and does not count towards the score.</Typography.Text>
        </div>
      </div>
    </Modal>
  );
}
