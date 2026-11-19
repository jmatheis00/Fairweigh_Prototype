"use client";

import { SearchOutlined } from "@ant-design/icons";
import { Card, Flex, Input, Table, Typography } from "antd";
import { useState } from "react";
import { WEIGHT_MAX, WEIGHT_MIN, type BuyerRules } from "@scc/shared";
import { COMPLAINT_THRESHOLDS, RATING_THRESHOLDS } from "@/lib/risk-levels";
import { useIsPhone } from "@/lib/use-phone";
import { PageHeader } from "./page-header";

interface Term {
  term: string;
  means: string;
  helps: string;
  where: string;
}

/** Every metric of the cockpit in one place (expert interviews, 10 Nov 2026). */
function terms(rules: BuyerRules | null): Term[] {
  const co2Price = rules?.co2PricePerTonneEur ?? 100;
  return [
    {
      term: "Result vs today",
      means: "Overall result of an offer, e.g. “9 % better than today”: the weighted average of how many % better or worse it is than today on the four criteria (at most 50 % either way). Green from 5 % better, red from 5 % worse, yellow in between, grey for the same as today. Calculated by fixed rules, not by AI.",
      helps: "Ranks the offers. The best result with real data is the recommendation.",
      where: "Compare step: “vs today” column and recommendation",
    },
    {
      term: "% against today",
      means: "Per criterion, how many % better or worse a value is than today (our last three purchases), capped at ±50 %. Quality counts deliveries without a complaint, delivery the deliveries on time, price and CO₂ less money and less CO₂. An arrow shows better or worse; a result that matches today says \"today\".",
      helps: "Shows how good a value really is, not only how it compares with the other offers.",
      where: "Compare step: under each value",
    },
    {
      term: "Today (reference)",
      means: "The reference per criterion: the average of our last three purchases of the part in the ERP. Price: their unit price (without purchases: the current contract). Quality and delivery: the ERP figures of the suppliers we bought from. CO₂: their product footprint. Without any value: the category average.",
      helps: "Shows whether an offer is better or worse than what we have, and the yardstick does not change when one offer is added or removed.",
      where: "Compare step: column titles (hover) and offer details",
    },
    {
      term: "Weights",
      means: `How much each criterion counts, together 100 %. The company sets a default per commodity group; the buyer may set each weight between ${WEIGHT_MIN} % and ${WEIGHT_MAX} %, so no criterion can be switched off or take over.`,
      helps: "Fits the ranking to the purchase without letting one person tune it until a favourite wins.",
      where: "Compare step: Weights. Changes are saved in the Decision Log",
    },
    {
      term: "Knock-out (excluded)",
      means: "An offer is excluded for a proven legal violation (fine notice), LkSG country risk High without a social audit (SA8000), or a known child or forced labour controversy. It stays visible without a score.",
      helps: "Keeps offers that must not be awarded out of the ranking.",
      where: "Compare step: Notes column, marked Excluded",
    },
    {
      term: "Warning",
      means: "Something to check that does not exclude an offer: e.g. allegations, medium risk, a lead time that is too long, old prices or old CO₂ data.",
      helps: "Points to what to ask the supplier before deciding.",
      where: "Compare step: Notes column",
    },
    {
      term: "Data missing · 50 % worse",
      means: "No verified value in the connected systems. The criterion counts as 50 % worse than today, so a gap never improves an offer.",
      helps: "Shows where data must be requested.",
      where: "Compare step and “What's missing”",
    },
    {
      term: "Score range",
      means: "For a supplier that never delivered to us: quality and delivery are a range from the weakest to the best of our current suppliers in the category. Such a supplier is ranked after all offers with real data, so a gap never beats real data.",
      helps: "Shows whether a new supplier could lead; if so, request a sample delivery first.",
      where: "Compare step: Score and the quality and delivery columns",
    },
    {
      term: "Product quality (complaint rate)",
      means: `Share of deliveries with a complaint over the last 12 months, from the ERP. Lower is better. In the supplier list: ${COMPLAINT_THRESHOLDS.high} % or more is marked high, from ${COMPLAINT_THRESHOLDS.medium} % medium.`,
      helps: "Measures how often there are problems with the parts.",
      where: "Compare step, supplier list and supplier details",
    },
    {
      term: "Delivery reliability (on time)",
      means: "Share of deliveries that arrived on time over the last 12 months, from the ERP. Higher is better.",
      helps: "Measures whether the supplier keeps its dates.",
      where: "Compare step, supplier list and supplier details",
    },
    {
      term: "Price per piece",
      means: "Unit price from the supplier's quotation. Lower is better. Total cost = price × quantity.",
      helps: "The cost side of the decision.",
      where: "Compare step and supplier details",
    },
    {
      term: "CO₂ per piece (PCF)",
      means: "Product carbon footprint of one piece in kg CO₂e, from the CO₂ exchange or the supplier's data sheet. Lower is better.",
      helps: "The sustainability side of the decision; feeds your CO₂ target.",
      where: "Compare step, CO₂ and risks, Results",
    },
    {
      term: "CO₂ data quality",
      means: "Four levels: Audited (the supplier's footprint for the part, checked by an auditor), Supplier calc. (the supplier's own, unchecked), Estimate (from the supplier's company-wide CO₂ intensity), Industry avg. (offer price × an industry factor). Levels 1 and 2 are supplier-specific data. An estimate or industry average never counts better than today.",
      helps: "Shows how far a CO₂ value can be trusted.",
      where: "Tag next to every CO₂ value; coverage on the recommendation",
    },
    {
      term: "CO₂ price",
      means: `${co2Price} € per tonne CO₂e, set by the Scope 3 manager. Turns CO₂ into euros for information.`,
      helps: "Puts CO₂ and price side by side. Never part of the score.",
      where: "Compare step: price vs. current supplier; Results",
    },
    {
      term: "CO₂ target",
      means: "CO₂ to avoid this year, set by the Scope 3 manager for the company, each buyer and each commodity group. Achieved = CO₂ avoided by Fairweigh decisions this year. Status: achieved; on track = at least the share of the year passed; otherwise at risk.",
      helps: "Makes the CO₂ effect of each decision visible and shows where the company falls behind.",
      where: "Work queue: progress bar; CO₂ targets page; CPO dashboard",
    },
    {
      term: "LkSG country risk",
      means: "Risk under the German Supply Chain Due Diligence Act for the supplier's country, from the rating partner: Low, Medium or High.",
      helps: "High without a social audit excludes an offer; Medium is a warning.",
      where: "Supplier list, supplier details, CO₂ and risks",
    },
    {
      term: "SA8000",
      means: "Certified social audit standard (working conditions). Needed when the LkSG country risk is High.",
      helps: "Proves that the risk is checked on site.",
      where: "Supplier details: certificates",
    },
    {
      term: "Sustainability rating",
      means: `Score 0–100 from the rating partner (EcoVadis style). In the supplier list: below ${RATING_THRESHOLDS.high} is marked high risk, below ${RATING_THRESHOLDS.medium} medium.`,
      helps: "A quick view of a supplier's overall sustainability management.",
      where: "Supplier list, supplier details",
    },
    {
      term: "SBTi target",
      means: "The supplier has a climate target validated by the Science Based Targets initiative.",
      helps: "Signals that the supplier's CO₂ will go down over time.",
      where: "Supplier details, CO₂ and risks",
    },
    {
      term: "Switch candidate",
      means: "A current supplier with high spend and more CO₂ per euro than the category average.",
      helps: "Shows where a new tender saves the most CO₂.",
      where: "CO₂ and risks: supplier map; Results: next best actions",
    },
    {
      term: "Avoided CO₂",
      means: "CO₂ of the replaced supplier minus CO₂ of the chosen one, times the ordered quantity.",
      helps: "The measurable effect of Fairweigh decisions.",
      where: "Results, work queue target",
    },
  ];
}

export function GlossaryPage({ rules }: { rules: BuyerRules | null }) {
  const [search, setSearch] = useState("");
  const isPhone = useIsPhone();
  const q = search.trim().toLowerCase();
  const shown = terms(rules).filter((t) => !q || `${t.term} ${t.means} ${t.where}`.toLowerCase().includes(q));
  return (
    <Flex vertical gap={12}>
      <PageHeader title="Glossary" subtitle="What every number in Fairweigh means, what it helps with and where you find it." />
      <Card
        className="dash-card"
        size="small"
        title={`Terms (${shown.length})`}
        extra={
          <Input
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            placeholder="Search a term"
            aria-label="Search the glossary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 240 }}
          />
        }
        styles={{ body: { padding: 0 } }}
      >
        {isPhone ? (
          <Flex vertical gap={8} style={{ padding: 12 }}>
            {shown.map((t) => (
              <div key={t.term} className="queue-item">
                <Typography.Text strong>{t.term}</Typography.Text>
                <Typography.Paragraph style={{ margin: "4px 0" }}>{t.means}</Typography.Paragraph>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  Helps with: {t.helps}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  Where: {t.where}
                </Typography.Text>
              </div>
            ))}
          </Flex>
        ) : (
        <Table<Term>
          size="small"
          rowKey="term"
          pagination={false}
          dataSource={shown}
          columns={[
            { title: "Term", dataIndex: "term", width: 220, render: (t: string) => <Typography.Text strong>{t}</Typography.Text> },
            { title: "What it means", dataIndex: "means" },
            { title: "What it helps with", dataIndex: "helps", width: 300 },
            { title: "Where in the tool", dataIndex: "where", width: 260 },
          ]}
        />
        )}
      </Card>
    </Flex>
  );
}
