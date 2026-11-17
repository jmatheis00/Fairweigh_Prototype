"use client";

import { Tag, Tooltip } from "antd";
import type { CSSProperties } from "react";
import { PCF_BADGE_LEVEL, type PcfBadge } from "@scc/shared";

/** Short label for narrow cells; the full name is in the tooltip. */
const SHORT: Record<PcfBadge, string> = {
  Verified: "Verified",
  "Supplier-specific": "Supplier",
  "Company estimate": "Estimate",
  "Industry average": "Industry avg.",
};

/** What each level of the team's CO₂ data-quality ladder means (data model, 8 Nov 2026). */
const MEANING: Record<PcfBadge, string> = {
  Verified: "Supplier-specific value for this part, checked by a third party.",
  "Supplier-specific": "Calculated by the supplier for this part, not checked by a third party.",
  "Company estimate": "Estimated from the supplier's company-wide CO₂ intensity.",
  "Industry average": "Average from an industry database, not supplier-specific.",
};

export function pcfBadgeTooltip(badge: PcfBadge): string {
  return `CO₂ data quality, level ${PCF_BADGE_LEVEL[badge]} of 4: ${badge}. ${MEANING[badge]}`;
}

/** The CO₂ data-quality level as a neutral tag with text (never colour alone). */
export function PcfBadgeTag({ badge, style }: { badge: PcfBadge; style?: CSSProperties }) {
  return (
    <Tooltip title={pcfBadgeTooltip(badge)}>
      <Tag style={{ marginInlineEnd: 0, ...style }}>{SHORT[badge]}</Tag>
    </Tooltip>
  );
}
