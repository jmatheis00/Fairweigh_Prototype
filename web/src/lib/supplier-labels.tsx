"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { Tooltip, Typography } from "antd";

/**
 * Plain words for the coded values of the source systems (Excel dropdowns).
 * Display only: the records keep the original value, which the detail panel shows as "In the ERP".
 */
const RELATIONSHIP: Record<string, { label: string; meaning: string }> = {
  "Active contract": { label: "Current supplier", meaning: "Active contract: we buy from this supplier today." },
  "Former supplier": { label: "Former supplier", meaning: "We bought from them in the past. Delivery and quality figures come from those orders." },
  "Quote only": { label: "Quote received", meaning: "Sent us a quote, but we never ordered. So there are no delivery or quality figures yet." },
  "New - found by AI agent": {
    label: "New candidate",
    meaning:
      "In the supplier master, but no contact or orders yet, so no delivery or quality figures.",
  },
};

const CO2_SOURCE: Record<string, { label: string; meaning: string }> = {
  "Sustainability report": { label: "Sustainability report", meaning: "From the supplier's published sustainability report." },
  "Supplier self-assessment": { label: "Supplier's own statement", meaning: "Questionnaire answered by the supplier, not checked by a third party." },
  "Supplier PCF declaration": { label: "Supplier's product footprint", meaning: "Product carbon footprint declared by the supplier for the part." },
  "Estimate (industry average)": { label: "Industry average", meaning: "No figures from the supplier: an average for the industry is used instead." },
  "Web search (AI agent)": {
    label: "Public web, unconfirmed",
    meaning:
      "The rating partner says these CO₂ figures come from public web sources; the supplier has not confirmed them.",
  },
};

export function relationshipLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return RELATIONSHIP[status]?.label ?? status;
}

export function co2SourceLabel(source: string | null | undefined): string {
  if (!source) return "Unknown";
  return CO2_SOURCE[source]?.label ?? source;
}

/** True when the supplier never delivered to us, so delivery and quality figures cannot exist. */
export function hasNoOrders(status: string | null | undefined): boolean {
  return status === "Quote only" || status === "New - found by AI agent";
}

/** Relationship in plain words; hover explains what it means. */
export function Relationship({ status }: { status: string | null | undefined }) {
  const entry = status ? RELATIONSHIP[status] : undefined;
  return (
    <Tooltip title={entry?.meaning}>
      <span>{relationshipLabel(status)}</span>
    </Tooltip>
  );
}

/** CO₂ data source in plain words; hover explains it. */
export function Co2Source({ source }: { source: string | null | undefined }) {
  const entry = source ? CO2_SOURCE[source] : undefined;
  if (!source) return <Typography.Text type="secondary">Unknown</Typography.Text>;
  return (
    <Tooltip title={entry?.meaning}>
      <span>{co2SourceLabel(source)}</span>
    </Tooltip>
  );
}

/** A missing figure with its reason instead of a bare dash. */
export function NoValue({ reason }: { reason: string }) {
  return <Typography.Text type="secondary">{reason}</Typography.Text>;
}

/** Column title with an info icon that lists what every value means. */
export function ExplainedTitle({ title, kind }: { title: string; kind: "relationship" | "co2Source" }) {
  const entries = Object.values(kind === "relationship" ? RELATIONSHIP : CO2_SOURCE);
  return (
    <Tooltip
      title={
        <div>
          {kind === "co2Source" && (
            <div style={{ marginBottom: 6 }}>
              Where the rating partner got the supplier&apos;s company-wide CO₂ figures.
            </div>
          )}
          {entries.map((e) => (
            <div key={e.label} style={{ marginBottom: 4 }}>
              <strong>{e.label}:</strong> {e.meaning}
            </div>
          ))}
        </div>
      }
    >
      <span>
        {title} <InfoCircleOutlined aria-label={`What ${title.toLowerCase()} means`} />
      </span>
    </Tooltip>
  );
}

export const RELATIONSHIP_OPTIONS = Object.entries(RELATIONSHIP).map(([value, e]) => ({ value, label: e.label }));
