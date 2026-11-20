"use client";

import { CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined, MinusCircleOutlined, StopOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Flex, Tag, Tooltip, Typography } from "antd";
import { CHILD_OR_FORCED_LABOUR, type DataLevel } from "@scc/shared";

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
  "Sustainability report": { label: "Sustainability report", meaning: "Published by the supplier." },
  "Supplier self-assessment": { label: "Supplier's own statement", meaning: "Questionnaire, not checked by a third party." },
  "Supplier PCF declaration": { label: "Supplier's product footprint", meaning: "Footprint the supplier declared for the part." },
  "Estimate (industry average)": { label: "Industry average", meaning: "No supplier figures; an industry average instead." },
  "Web search (AI agent)": {
    label: "Public web, unconfirmed",
    meaning: "Found online, not confirmed by the supplier.",
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
      // Wider than the default, so each entry fits on about one line and the box stays short (20 Nov 2026).
      styles={{ root: { maxWidth: 400 } }}
      title={
        <div>
          {kind === "co2Source" && (
            <div style={{ marginBottom: 4 }}>
              Source of the supplier&apos;s company CO₂ figures:
            </div>
          )}
          {entries.map((e) => (
            <div key={e.label} style={{ marginBottom: 2 }}>
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
export function SupplierNameLink({
  supplierId,
  name,
  onOpen,
  ellipsis = false,
}: {
  supplierId: string;
  name: string;
  onOpen?: (supplierId: string) => void;
  /** One line, cut with "…" (full name on hover), so rows in short lists keep the same height (20 Nov 2026). */
  ellipsis?: boolean;
}) {
  const oneLine = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: "100%" } as const;
  if (!onOpen) return ellipsis ? <span style={oneLine} title={name}>{name}</span> : <>{name}</>;
  return (
    // Same petrol link as the supplier names on Results and in the Decision log.
    <Button
      type="link"
      size="small"
      className="inline-link"
      title={ellipsis ? name : undefined}
      style={{ fontSize: "inherit", textAlign: "left", whiteSpace: ellipsis ? "nowrap" : "normal", maxWidth: "100%" }}
      onClick={() => onOpen(supplierId)}
    >
      {ellipsis ? <span style={oneLine}>{name}</span> : name}
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

const SHORT_FLAG: Record<string, string> = { "Proven violation": "Violation", "LkSG risk High": "LkSG High", "Controversy reported": "Controversy" };

/**
 * Risk flags as tags with icon and word: violation and LkSG High red, controversy yellow. A child or forced labour
 * controversy is a knock-out (K3), so it shows as its own red tag instead of a yellow "Controversy" (20 Nov 2026);
 * the controversy text is on hover. `short` gives one-word labels for narrow lists.
 */
export function FlagTags({ flags, controversy, short = false }: { flags: string[]; controversy?: string | null; short?: boolean }) {
  if (!flags.length) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <Flex wrap gap={4}>
      {flags.map((flag) => {
        const isControversy = flag === "Controversy reported";
        const labour = isControversy && controversy ? CHILD_OR_FORCED_LABOUR.exec(controversy) : null;
        const label = labour ? (/child/i.test(labour[0]) ? "Child labour" : "Forced labour") : short ? (SHORT_FLAG[flag] ?? flag) : flag;
        const tag = (
          <Tag key={flag} icon={labour ? <StopOutlined /> : FLAG_ICON[flag]} color={isControversy && !labour ? "warning" : "error"} style={{ marginInlineEnd: 0 }}>
            {label}
          </Tag>
        );
        return isControversy && controversy ? (
          <Tooltip key={flag} title={controversy}>
            {tag}
          </Tooltip>
        ) : (
          tag
        );
      })}
    </Flex>
  );
}
