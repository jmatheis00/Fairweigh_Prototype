"use client";

import { Modal, Typography } from "antd";
import { CRITERIA, WEIGHT_DEVIATION_LIMIT, type BuyerRules, type Weights } from "@scc/shared";
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
    <Modal open={open} onCancel={onClose} onOk={onClose} cancelButtonProps={{ style: { display: "none" } }} okText="Close" title={title} width={680}>
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
      <Typography.Title level={5}>The score in detail</Typography.Title>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>
          <strong>Knock-outs first.</strong> An offer is excluded for a proven legal violation (fine notice), LkSG country risk High
          without a social audit (SA8000), or a known child or forced labour controversy. It stays visible, without a score. Other risks,
          controversies and long lead times are warnings.
        </li>
        <li>
          <strong>Points per criterion (0–100) against today.</strong> 50 points means the same as today. Every 1 % better adds a
          point, every 1 % worse removes one. Today means the average of our last three purchases of the part
          in the client ERP: their unit price, and the quality, delivery and CO₂ figures of the suppliers we bought from. Without
          purchases, the current contract and the current supplier are used; without any value, the category average. Hover a column title to see the value and its source.
        </li>
        <li>
          <strong>Industry average as context.</strong> The published CO₂ average of the material (aluminium: IAI, steel: worldsteel,
          copper: ICA, rubber: OEKOBAUDAT) is shown next to the result, so you see whether even the best offer should improve. It covers
          the material only, so it does not count towards the score.
        </li>
        <li>
          <strong>Gaps never help.</strong> A missing or unverified value gets 0 points and a visible notice.
        </li>
        <li>
          <strong>Weighting.</strong> The weights (together 100 %) weight the four criteria: product quality, price, CO₂ and delivery
          reliability. The company sets a default per commodity group; the buyer may move each weight by at most {WEIGHT_DEVIATION_LIMIT}{" "}
          percentage points and must justify a change.
        </li>
        <li>
          <strong>Score bands.</strong> {SCORE_BAND_LABEL.strong}, {SCORE_BAND_LABEL.medium}, {SCORE_BAND_LABEL.weak}.
        </li>
      </ol>
      <Typography.Text type="secondary">CO₂ in euros is shown for information only and does not count towards the score.</Typography.Text>
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
    </Modal>
  );
}
