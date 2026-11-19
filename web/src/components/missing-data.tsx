"use client";

import { MailOutlined } from "@ant-design/icons";
import { Button, Flex, Typography } from "antd";
import { CRITERIA, type AgentRun, type Criterion, type DecisionResult, type LeadRequirement } from "@scc/shared";
import { dataRequestText, offerDataRequest, requestItems, requestMailto } from "@/lib/data-request";
import { TOPIC_LABEL, formatNumber, formatEur, formatVsToday } from "@/lib/labels";
import { pcfBadgeTooltip } from "./pcf-badge-tag";

interface Props {
  run: AgentRun;
  result: DecisionResult;
  supplierNames: Record<string, string>;
  /** What each offer with gaps would need to lead (from the decision engine). */
  requirements: Record<string, LeadRequirement | null>;
  partName: string;
  /** Suppliers that never delivered: asked for a sample delivery instead of quality and delivery figures. */
  neverDelivered?: Set<string>;
}

/** "quality ≤ 0.9 % complaints", "delivery ≥ 93 % on time". */
function condition(c: Criterion, value: number | null): string {
  if (value === null) return `any verified ${TOPIC_LABEL[c].toLowerCase()} value`;
  switch (c) {
    case "quality":
      return `complaints ≤ ${formatNumber(value, 1)} %`;
    case "delivery":
      return `on-time delivery ≥ ${formatNumber(value, 0)} %`;
    case "price":
      return `price ≤ ${formatEur(value, 2)}`;
    case "co2":
      return `CO₂ ≤ ${formatNumber(value, 1)} kg per piece`;
  }
}

/** One sentence: would closing the gaps be worth it? */
function impact(r: LeadRequirement | null, name: string): string | null {
  if (!r) return null;
  if (r.canLead && r.needed) {
    return `${name} would take first place with verified ${list(r.needed.map((n) => condition(n.criterion, n.value)))}. Closing these gaps can change the recommendation.`;
  }
  return `Even with the best values among the offers, ${name} would reach ${formatVsToday(r.bestCaseScore).replace(/^Same/, "the same")} and rank ${r.bestCaseRank}. Closing these gaps would not change the recommendation.`;
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * Page "What's missing to decide": per offer the gaps and whether closing
 * them could change the result. Outdated data is listed too.
 */
export function MissingData({ run, result, supplierNames, requirements, partName, neverDelivered }: Props) {
  const items = run.request.supplierIds
    .map((id) => {
      const ranked = result.ranked.find((r) => r.supplierId === id);
      const excluded = result.excluded.find((x) => x.supplierId === id);
      const missing = ranked?.missing ?? [];
      const stale = (ranked?.warnings ?? []).filter((w) => /outdated|Indicative|Lead time not verified/.test(w));
      const co2Badge = run.evidence.find((e) => e.supplierId === id && e.topic === "co2" && e.status === "verified")?.sourceBadge ?? null;
      const request = offerDataRequest(run, result, id, supplierNames[id] ?? id, partName, neverDelivered?.has(id) ?? false);
      return { id, ranked, excluded, missing, stale, co2Badge, request, asks: requestItems(request) };
    })
    .filter((i) => !i.excluded && (i.missing.length > 0 || i.stale.length > 0 || i.asks.length > 0));

  if (items.length === 0) {
    return <Typography.Text>All offers with a score have verified values for all {CRITERIA.length} criteria.</Typography.Text>;
  }

  return (
    <Flex vertical gap={16}>
      <Typography.Text type="secondary">
        Gaps count as 50 % worse than today, so closing them can change the ranking. Each offer has a data request that opens as an e-mail draft in
        your own mail program; nothing is sent from here. Excluded offers are not listed.
      </Typography.Text>
      {items.map((i) => (
        <div key={i.id} className="missing-item">
          <Typography.Text strong>
            {supplierNames[i.id] ?? i.id} <Typography.Text type="secondary">{i.id}</Typography.Text>
          </Typography.Text>
          {i.missing.length > 0 && (
            <>
              <div>
                Missing: <strong>{list(i.missing.map((c) => TOPIC_LABEL[c]))}</strong> ({i.ranked?.verifiedCount} of {CRITERIA.length}{" "}
                verified)
              </div>
              {(() => {
                const text = impact(requirements[i.id] ?? null, supplierNames[i.id] ?? i.id);
                if (!text) return null;
                const worth = requirements[i.id]?.canLead;
                return (
                  <div className={worth ? "impact impact-worth" : "impact"}>
                    <strong>{worth ? "Could change the result:" : "Not decisive:"}</strong> {text}
                  </div>
                );
              })()}
            </>
          )}
          {i.stale.length > 0 && (
            <div>
              Outdated or not binding: {i.stale.join("; ")}.
            </div>
          )}
          {i.co2Badge && !i.missing.includes("co2") && i.asks.some((a) => a.includes("estimate")) && (
            <div title={pcfBadgeTooltip(i.co2Badge)}>CO₂ value is only an estimate ({i.co2Badge}).</div>
          )}
          {i.asks.length > 0 && (
            <Flex vertical gap={4} style={{ marginTop: 6 }}>
              <Flex gap={8} align="center" wrap>
                <Button
                  size="small"
                  icon={<MailOutlined />}
                  href={requestMailto(dataRequestText(i.request))}
                  aria-label={`Request missing data from ${supplierNames[i.id] ?? i.id}`}
                >
                  Request missing data
                </Button>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Asks for {i.asks.length} {i.asks.length === 1 ? "item" : "items"}
                </Typography.Text>
              </Flex>
              <details className="request-preview">
                <summary>Preview</summary>
                <pre>{dataRequestText(i.request)}</pre>
              </details>
            </Flex>
          )}
        </div>
      ))}
    </Flex>
  );
}
