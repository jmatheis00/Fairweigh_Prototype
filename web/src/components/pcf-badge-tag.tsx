"use client";

import { Tag, Tooltip } from "antd";
import type { CSSProperties } from "react";
import { PCF_BADGE_LEVEL, type PcfBadge } from "@scc/shared";

/**
 * Plain names for the CO₂ data-quality levels (19 Nov 2026): "Audited" instead of "Verified", so "verified"
 * only ever means the evidence check. The records keep the original level names.
 */
const SHORT: Record<PcfBadge, string> = {
  Verified: "Audited",
  "Supplier-specific": "Supplier calc.",
  "Company estimate": "Estimate",
  "Industry average": "Industry avg.",
};

const LABEL: Record<PcfBadge, string> = {
  Verified: "Audited",
  "Supplier-specific": "Supplier's own calculation",
  "Company estimate": "Company estimate",
  "Industry average": "Industry average",
};

/** How each level of the team's CO₂ data-quality ladder is made (data model, 8 Nov 2026). */
const MEANING: Record<PcfBadge, string> = {
  Verified: "The supplier's footprint for this part, checked by an independent auditor.",
  "Supplier-specific": "The supplier's own footprint for this part, not checked by an auditor.",
  "Company estimate": "Not a figure for this part: scaled from the supplier's company-wide CO₂ intensity. Counts at most as today.",
  "Industry average": "No supplier data: offer price × an industry CO₂ factor. Counts at most as today.",
};

export function pcfBadgeLabel(badge: PcfBadge): string {
  return LABEL[badge];
}

export function pcfBadgeTooltip(badge: PcfBadge): string {
  return `CO₂ data quality, level ${PCF_BADGE_LEVEL[badge]} of 4: ${LABEL[badge]}. ${MEANING[badge]}`;
}

/** The CO₂ data-quality level as a neutral tag with text (never colour alone). */
export function PcfBadgeTag({ badge, style }: { badge: PcfBadge; style?: CSSProperties }) {
  return (
    <Tooltip title={pcfBadgeTooltip(badge)}>
      <Tag style={{ marginInlineEnd: 0, ...style }}>{SHORT[badge]}</Tag>
    </Tooltip>
  );
}
