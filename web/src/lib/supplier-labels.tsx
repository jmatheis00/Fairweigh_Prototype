"use client";

import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined, MinusCircleOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Flex, Tag, Tooltip, Typography } from "antd";
import type { DataLevel } from "@scc/shared";

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

/**
 * A supplier name that opens the supplier side panel (Sarah's view, 19 Nov 2026).
 * Without `onOpen` it is plain text, so the same list works where no panel is available.
 */
export function SupplierNameLink({ supplierId, name, onOpen }: { supplierId: string; name: string; onOpen?: (supplierId: string) => void }) {
  if (!onOpen) return <>{name}</>;
  return (
    // Same petrol link as the supplier names on Results and in the Decision log.
    <Button type="link" size="small" className="inline-link" style={{ fontSize: "inherit", textAlign: "left", whiteSpace: "normal" }} onClick={() => onOpen(supplierId)}>
      {name}
    </Button>
  );
}

/** Data level as icon plus word (never colour alone). */
export function DataLevelLabel({ level }: { level: DataLevel }) {
  if (level === "sufficient") return <span className="tone-good"><CheckCircleOutlined /> Sufficient</span>;
  if (level === "partial") return <span className="tone-warn"><MinusCircleOutlined /> Partly</span>;
  return <span className="tone-bad"><CloseCircleOutlined /> Insufficient</span>;
}

export const DATA_LEVEL_OPTIONS: { value: DataLevel; label: string }[] = [
  { value: "insufficient", label: "Insufficient" },
  { value: "partial", label: "Partly" },
  { value: "sufficient", label: "Sufficient" },
];

const FLAG_ICON: Record<string, React.ReactNode> = {
  "Proven violation": <StopOutlined />,
  "LkSG risk High": <ExclamationCircleOutlined />,
  "Controversy reported": <WarningOutlined />,
};

/** The risk flags of the team rule set, in the order of the filters. */
export const FLAG_NAMES = Object.keys(FLAG_ICON);

/** Risk flags as tags with icon and word: violation and LkSG High red, controversy yellow. */
export function FlagTags({ flags }: { flags: string[] }) {
  if (!flags.length) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <Flex wrap gap={4}>
      {flags.map((flag) => (
        <Tag key={flag} icon={FLAG_ICON[flag]} color={flag === "Controversy reported" ? "warning" : "error"} style={{ marginInlineEnd: 0 }}>
          {flag}
        </Tag>
      ))}
    </Flex>
  );
}
