"use client";

import { ArrowDownOutlined, ArrowUpOutlined, FileSearchOutlined, MailOutlined, MinusOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Flex, Tag, Tooltip, Typography } from "antd";
import { CRITERIA, compareWithBaseline, formatDay, totalCo2Tonnes, totalCostEur, verifiedEvidence, type AgentRun, type DecisionResult } from "@scc/shared";
import { SCORE_BAND_LABEL, formatEur, formatNumber, formatVsToday, formatVsTodayShort, knockOutLabel, scoreBand } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { priceRequestMailto } from "@/lib/price-request";

interface Props {
  run: AgentRun;
  result: DecisionResult;
  supplierNames: Record<string, string>;
  currentSupplierId: string | null;
  co2PricePerTonneEur: number;
}

const percent = (n: number) => `${formatNumber(Math.abs(n), 1)} %`;

function pricePhrase(p: number | null): string {
  if (p === null) return "its price is not verified";
  if (p === 0) return "costs the same";
  return p > 0 ? `costs ${percent(p)} more` : `costs ${percent(p)} less`;
}

function co2Phrase(c: number | null): string {
  if (c === null) return "its CO₂ value is not verified";
  if (c === 0) return "emits the same CO₂";
  return c < 0 ? `emits ${percent(c)} less CO₂` : `emits ${percent(c)} more CO₂`;
}

/** The decision as a headline (the recommended supplier) and plain sentences. A fixed template filled from the ranking, never AI text. */
export function decisionSummaryParts({ run, result, supplierNames, currentSupplierId, co2PricePerTonneEur }: Props): {
  headline: string | null;
  text: string;
  exclusions: string;
  gaps: string;
  couldLead: string;
} {
  const name = (id: string) => shortName(supplierNames[id] ?? id);
  const rec = result.recommendation;
  const parts: string[] = [];
  let headline: string | null = null;
  if (!rec) {
    parts.push("No offer can be recommended: every offer is excluded or has no score.");
  } else if (rec.supplierId === currentSupplierId) {
    headline = name(rec.supplierId);
    parts.push("Already your current supplier.");
  } else if (currentSupplierId && run.request.supplierIds.includes(currentSupplierId)) {
    const cmp = compareWithBaseline(run, rec.supplierId, currentSupplierId, co2PricePerTonneEur);
    headline = name(rec.supplierId);
    parts.push(`Compared with your current supplier ${name(currentSupplierId)} it ${pricePhrase(cmp.pricePercent)} and ${co2Phrase(cmp.co2Percent)}.`);
  } else {
    headline = name(rec.supplierId);
    parts.push(`${formatVsToday(rec.score)}.`);
  }
  let exclusions = "";
  let gapText = "";
  let couldLeadText = "";
  if (result.excluded.length > 0) {
    const reasons = [...new Set(result.excluded.map((e) => knockOutLabel(e.knockOut.reason).replace(/^Excluded: /, "")))];
    exclusions = `${result.excluded.length} ${result.excluded.length === 1 ? "offer is" : "offers are"} excluded (${reasons.join("; ")}).`;
    parts.push(exclusions);
  }
  const gapOffers = result.ranked.filter((r) => r.verifiedCount < CRITERIA.length);
  const gaps = gapOffers.length;
  const assumed = gapOffers.filter((r) => r.assumed.length > 0).length;
  if (gaps > 0) {
    gapText =
      `${gaps} ${gaps === 1 ? "offer has" : "offers have"} data gaps` +
      (assumed > 0
        ? `; suppliers without deliveries get a range and are ranked after all offers with real data.`
        : "; a missing value counts as 50 % worse than today.");
    parts.push(gapText);
  }
  for (const c of rec?.couldLead ?? []) {
    const t = `${name(c.supplierId)} could be ahead at its best (up to ${formatVsToday(c.high).replace(/^Same/, "the same")}) but has never delivered: request a sample delivery first.`;
    couldLeadText = [couldLeadText, t].filter(Boolean).join(" ");
    parts.push(t);
  }
  return { headline, text: parts.join(" "), exclusions, gaps: gapText, couldLead: couldLeadText };
}

/** A signed number; values that round to zero show as "±0", never "-0.0". */
export const signed = (n: number, digits: number, unit = "") => {
  const r = Number(n.toFixed(digits));
  return `${r > 0 ? "+" : r < 0 ? "-" : "±"}${formatNumber(Math.abs(r), digits)}${unit}`;
};

/** A difference as text plus a word, so meaning never depends on colour. */
export function Delta({ value, digits, unit, lowerIsBetter }: { value: number | null; digits: number; unit: string; lowerIsBetter: boolean }) {
  if (value === null) return <Typography.Text type="secondary">Not verified</Typography.Text>;
  const better = lowerIsBetter ? value < 0 : value > 0;
  const word = value === 0 ? "same" : better ? "better" : "worse";
  return (
    <span className={`delta delta-${value === 0 ? "same" : better ? "better" : "worse"}`} style={{ whiteSpace: "nowrap" }}>
      {value === 0 ? <MinusOutlined /> : better ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {signed(value, digits, unit)}{" "}
      <span className="delta-word">{word}</span>
    </span>
  );
}

interface BlockProps extends Props {
  /** Product name for the price request e-mail. */
  partName: string;
  onWhy: () => void;
  onShowMissing: () => void;
  onShowEvidence: () => void;
}

/** One figure tile: label on top, one big value with arrow, one small line with word and percentage. */
function FigureTile({ label, value, tone, line }: { label: string; value: React.ReactNode; tone?: "good" | "bad"; line: React.ReactNode }) {
  return (
    <div className="rec-tile">
      <div className="rec-label">{label}</div>
      <div className={`rec-value${tone ? ` tone-${tone}` : ""}`}>{value}</div>
      <div className="rec-line">{line}</div>
    </div>
  );
}

/** Lower is better for price and CO2. Returns arrow, tone and word for a difference. */
function judge(value: number | null) {
  if (value === null || value === 0) return { icon: <MinusOutlined />, tone: undefined, word: value === null ? "not verified" : "same" };
  return value < 0
    ? { icon: <ArrowDownOutlined />, tone: "good" as const, word: "better" }
    : { icon: <ArrowUpOutlined />, tone: "bad" as const, word: "worse" };
}

/** Recommendation block of the compare step: name and score on the left, three figure tiles on the right. Details are in the side panel. */
export function RecommendationBlock(props: BlockProps) {
  const { run, result, supplierNames, currentSupplierId, co2PricePerTonneEur, partName, onWhy, onShowMissing, onShowEvidence } = props;
  const rec = result.recommendation;
  const name = (id: string) => shortName(supplierNames[id] ?? id);
  const hasCurrent = !!currentSupplierId && run.request.supplierIds.includes(currentSupplierId);
  const isCurrent = !!rec && rec.supplierId === currentSupplierId;
  const cmp = rec && hasCurrent && !isCurrent ? compareWithBaseline(run, rec.supplierId, currentSupplierId!, co2PricePerTonneEur) : null;
  // Evidence of the recommended offer only (feedback 18 Nov 2026): the count over all offers said little.
  const recVerified = result.ranked.find((r) => r.supplierId === rec?.supplierId)?.verifiedCount ?? 0;
  const couldLead = rec?.couldLead ?? [];
  const pct = (p: number | null) => (p === null ? "" : p === 0 ? "" : ` · ${p > 0 ? "+" : "-"}${percent(p)} per piece`);

  // Whole order of the recommended offer (feedback 17 Nov 2026): what the buyer commits to, from verified values only.
  const q = run.request.quantity;
  const verifiedValue = (topic: "price" | "co2") => {
    const e = rec ? verifiedEvidence(run, rec.supplierId, topic) : undefined;
    return e && typeof e.value === "number" ? e.value : null;
  };
  const unitPrice = verifiedValue("price");
  const priceDate = rec ? (verifiedEvidence(run, rec.supplierId, "price")?.sourceDate ?? null) : null;
  const pcf = verifiedValue("co2");
  const pcs = `${q.toLocaleString("en-GB")} pcs`;
  const orderPrice = unitPrice === null ? null : formatEur(totalCostEur(unitPrice, q), 0);
  const orderCo2 = pcf === null ? null : `${formatNumber(totalCo2Tonnes(pcf, q), 1)} t CO₂e`;
  const signedTotal = (n: number | null, digits: number, unit: string) => (n === null ? "" : ` (${signed(n, digits, unit)})`);

  const priceJ = cmp ? judge(cmp.priceDeltaEur) : null;
  const co2J = cmp ? judge(cmp.co2DeltaKg) : null;

  return (
    <div className="decision-summary rec-block" role="note">
      {/* One clear target (feedback 18 Nov 2026): only the "View details" button opens the "Why this recommendation?"
          panel; the tile background is no longer clickable. */}
      <div className="rec-main">
        <div className="rec-label">Recommended</div>
        {rec ? (
          <>
            {/* Name and result on one line (feedback 18 Nov 2026): the result is the same soft pill as in the
                offer table, in words ("9 % better than today"), coloured by band; never colour alone. */}
            {/* Same three rows as the figure tiles (18 Nov 2026): label, value line, small line. The value line
                holds the name and the same pill as the offer table ("9 % better"); a long name is cut with "…"
                and shown in full in its tooltip, so the box never grows a row. */}
            <div className="rec-name-line">
              <Tooltip title={name(rec.supplierId)}>
                <Typography.Title level={4} className="rec-name" tabIndex={0}>
                  {name(rec.supplierId)}
                </Typography.Title>
              </Tooltip>
              <Tooltip title={`${formatVsToday(rec.score)}: weighted average of how many % better or worse the offer is than today on each criterion (up to 50 % either way). ${SCORE_BAND_LABEL[scoreBand(rec.score)]}.`}>
                <span tabIndex={0} className={`score-pill score-${scoreBand(rec.score)}`} aria-label={formatVsToday(rec.score)}>
                  {formatVsTodayShort(rec.score) === "same" ? "Same as today" : formatVsTodayShort(rec.score)}
                </span>
              </Tooltip>
            </div>
            <Flex gap={8} align="center" wrap className="rec-actions">
              <Button type="primary" size="small" icon={<FileSearchOutlined />} onClick={onWhy}>
                View details
              </Button>
              {/* A current price matters before deciding (feedback 17 Nov 2026): the e-mail draft is on the first screen. */}
              <Tooltip
                title={`Opens an e-mail draft asking ${supplierNames[rec.supplierId] ?? rec.supplierId} for a current, binding price${
                  priceDate ? ` (quoted ${formatDay(priceDate)})` : ""
                }. Nothing is sent automatically.`}
              >
                <Button
                  size="small"
                  icon={<MailOutlined />}
                  href={priceRequestMailto(run, rec.supplierId, supplierNames[rec.supplierId] ?? rec.supplierId, partName)}
                  aria-label={`Request a current price from ${supplierNames[rec.supplierId] ?? rec.supplierId}`}
                >
                  Request current price
                </Button>
              </Tooltip>
            </Flex>
            {/* One short line (feedback 18 Nov 2026); the full sentence is in the tooltip and in "View details". */}
            {couldLead.map((c) => (
              <Tooltip
                key={c.supplierId}
                title={`${name(c.supplierId)} could be ahead at its best (up to ${formatVsToday(c.high).replace(/^Same/, "the same")}) but has never delivered: request a sample delivery first.`}
              >
                <Tag
                  icon={<WarningOutlined />}
                  tabIndex={0}
                  className="rec-could-lead"
                  style={{ marginInlineEnd: 0, marginTop: 4 }}
                >
                  {name(c.supplierId)} could be ahead (up to {formatVsTodayShort(c.high)}) · request a sample
                </Tag>
              </Tooltip>
            ))}
          </>
        ) : (
          <>
            <Typography.Title level={4} style={{ margin: 0, lineHeight: 1.25 }}>
              No recommendation
            </Typography.Title>
            <Typography.Text type="secondary">No offer can be recommended: every offer is excluded or has no score.</Typography.Text>
          </>
        )}
      </div>
      {cmp && priceJ && co2J && (
        <>
          <FigureTile
            label="Price vs current"
            tone={priceJ.tone}
            value={
              <>
                {priceJ.icon} {signed(cmp.priceDeltaEur ?? 0, 2, " €/pc")}
              </>
            }
            line={
              <>
                {priceJ.word}
                {pct(cmp.pricePercent)}
                {orderPrice && (
                  <>
                    <br />
                    {pcs}: {orderPrice}
                    {signedTotal(cmp.totalDeltaEur, 0, " €")}
                  </>
                )}
              </>
            }
          />
          <FigureTile
            label="CO₂ vs current"
            tone={co2J.tone}
            value={
              <>
                {co2J.icon} {signed(cmp.co2DeltaKg ?? 0, 1, " kg/pc")}
              </>
            }
            line={
              <>
                {co2J.word}
                {pct(cmp.co2Percent)}
                {orderCo2 && (
                  <>
                    <br />
                    {pcs}: {orderCo2}
                    {signedTotal(cmp.co2TotalDeltaT, 1, " t")}
                  </>
                )}
              </>
            }
          />
        </>
      )}
      {rec && isCurrent && (
        <div className="rec-tile rec-note">
          <div className="rec-label">Vs current</div>
          <div className="rec-line" style={{ fontSize: 14 }}>
            Already your current supplier
          </div>
          {(orderPrice || orderCo2) && (
            <div className="rec-line">
              {pcs}: {[orderPrice, orderCo2].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      )}
      {rec && (
        <div className="rec-tile">
          <div className="rec-label">Evidence</div>
          <div className="rec-value">
            {recVerified === CRITERIA.length ? <SafetyCertificateOutlined /> : <WarningOutlined />}{" "}
            <Button type="link" className="inline-link rec-value-link" onClick={onShowMissing} aria-label="Open what is missing">
              {recVerified}/{CRITERIA.length}
            </Button>
          </div>
          <div className="rec-line">
            criteria verified
            <br />
            <Button type="link" size="small" className="inline-link" onClick={onShowEvidence}>
              All evidence
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
