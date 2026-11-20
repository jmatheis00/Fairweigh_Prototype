"use client";

import { ArrowDownOutlined, ArrowRightOutlined, CheckCircleOutlined, CloudOutlined, EuroOutlined, InfoCircleOutlined, SafetyCertificateOutlined, SwapOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Table, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { abatementOptions, withoutDecidedSwitches, co2TargetPath, formatDay, impactStats, purchasedCo2, type AbatementOption, periodOptions, type DecisionRecord, type DemoSettings, type PurchaseOrderRecord } from "@scc/shared";
import { api } from "@/lib/api";
import { formatMonth, formatNumber, shortPartName, formatEur } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { PageHeader } from "./page-header";
import { InfoTip } from "./info-tip";
import { AbatementTable, Co2TargetChart } from "./analytics-charts";
import { BRAND } from "@/lib/theme";
import { FilterBar, defaultFilter, type StatsFilter } from "./filter-bar";
import { PurchaseOrdersCard } from "./purchase-orders-card";

const eur = (n: number, digits = 0) => formatEur(n, digits);
/** A cost change in words, so a saving never reads as a negative cost. */
const costChange = (n: number) => (n < 0 ? `saves ${formatEur(-n, 0)}` : n > 0 ? `costs ${formatEur(n, 0)} more` : "same cost");

interface Props {
  /** Opens a decision in the Decision Log, or a supplier's details in a side panel (the page stays). */
  onOpenDecision: (record: DecisionRecord) => void;
  onOpenSupplier: (supplierId: string) => void;
  settings: DemoSettings;
  /** Decision log: examples plus the recorded decisions. */
  log: DecisionRecord[];
  supplierNames: Record<string, string>;
  /**
   * One Results page for every role (decisions 20 Nov 2026). The sustainability manager sees the share of
   * supplier-specific CO₂ data as third tile; a buyer sees spend there and the purchase orders at the bottom.
   */
  forSustainability?: boolean;
}

/** Results: purchased CO₂ against the target path, and what the Fairweigh decisions cost and avoided. */
export function ImpactPage({ settings, log, supplierNames, onOpenDecision, onOpenSupplier, forSustainability = false }: Props) {
  const [orders, setOrders] = useState<PurchaseOrderRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatsFilter | null>(null);
  const [options2, setOptions2] = useState<AbatementOption[] | null>(null);

  useEffect(() => {
    api
      .purchaseOrders()
      .then(setOrders)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Next best actions: today's quotations against today's suppliers, at last year's quantities.
  useEffect(() => {
    Promise.all([api.quotations(), api.pcfList(), api.purchaseOrders(), api.ratingList(), api.fineNotices()])
      .then(([offers, pcf, purchaseOrders, ratings, documents]) =>
        setOptions2(abatementOptions({ catalog: settings.catalog, offers, pcf, purchaseOrders, ratings, documents, lastMonth: "2026-09" })),
      )
      .catch(() => setOptions2([]));
  }, [settings.catalog]);

  const options = useMemo(() => (orders ? periodOptions(orders.map((o) => o.orderDate)) : null), [orders]);
  const active = filter ?? (options ? defaultFilter(options) : null);
  // The product filter applies to orders and to the decision log; the period only to the orders (their dates).
  const productLog = useMemo(() => (active?.partId ? log.filter((d) => d.partId === active.partId) : log), [log, active]);
  const stats = useMemo(
    () =>
      orders && active
        ? impactStats(
            active.partId ? orders.filter((o) => o.partId === active.partId) : orders,
            productLog,
            settings.co2PricePerTonneEur,
            active.period,
          )
        : null,
    [orders, active, productLog, settings.co2PricePerTonneEur],
  );

  if (error) return <Alert type="error" showIcon title={`Impact data not available: ${error}`} />;
  if (!stats || !orders || !options || !active) return null;

  const name = (id: string) => shortName(supplierNames[id] ?? id);
  const part = (id: string) => (settings.catalog.find((p) => p.partId === id)?.partName ?? id).split(",")[0]!;
  const products = settings.catalog
    .filter((p) => orders.some((o) => o.partId === p.partId))
    .map((p) => ({ partId: p.partId, label: shortPartName(p.partId, p.partName), name: p.partName }));
  // The latest six decisions plus every decision with orders in the period, newest first.
  const impactOf = (recordId: string) => stats.decisions.find((d) => d.decisionId === recordId);
  const decisionRows = [...productLog]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .filter((r, i) => i < 6 || impactOf(r.recordId) !== undefined);
  const productOrders = active.partId ? orders.filter((o) => o.partId === active.partId) : orders;
  const purchased = purchasedCo2(productOrders, active.period);
  const trend =
    purchased.previous && purchased.previous.co2Tonnes > 0
      ? Math.round(((purchased.co2Tonnes - purchased.previous.co2Tonnes) / purchased.previous.co2Tonnes) * 1000) / 10
      : null;
  // The target path is built from the whole history (it starts from the 2025 average); the chart shows the 12 months
  // up to the end of the chosen period, or the whole period if longer, with the period shaded (20 Nov 2026). So both
  // filters apply and a quarter still shows a trend.
  const windowStart = (() => {
    const [y, m] = active.period.to.split("-").map(Number) as [number, number];
    const back = new Date(Date.UTC(y, m - 1 - 11, 1)).toISOString().slice(0, 7);
    return back < active.period.from ? back : active.period.from;
  })();
  const path = co2TargetPath(productOrders).filter((p) => p.month >= windowStart && p.month <= active.period.to);
  const inPeriodPoints = path.filter((p) => p.month >= active.period.from && p.month <= active.period.to);
  const pathGap = inPeriodPoints.length
    ? (inPeriodPoints.reduce((a, p) => a + p.actualTonnes, 0) / inPeriodPoints.reduce((a, p) => a + p.targetTonnes, 0) - 1) * 100
    : null;
  const share = purchased.supplierSpecificSpendPercent;
  const spendTrend =
    purchased.previous && purchased.previous.spendEur > 0
      ? Math.round(((purchased.spendEur - purchased.previous.spendEur) / purchased.previous.spendEur) * 1000) / 10
      : null;
  // Orders of the chosen period and product, newest first, for the buyer's order list.
  const periodOrders = productOrders
    .filter((o) => o.orderDate.slice(0, 7) >= active.period.from && o.orderDate.slice(0, 7) <= active.period.to)
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  const avoidedCard = (
    <Card className="dash-card" size="small">
      <div className="kpi-label"><CloudOutlined /> CO₂e avoided, {stats.period.label}</div>
      <div className={`kpi-value ${stats.avoidedTonnes > 0 ? "kpi-good" : ""}`}>
        {stats.avoidedTonnes > 0 && <ArrowDownOutlined />} {formatNumber(stats.avoidedTonnes, 1)} t
      </div>
      {/* Orders only; CO₂ targets counts the whole year plus decisions not ordered yet (20 Nov 2026). */}
      <div className="kpi-sub">
        orders only, vs the replaced suppliers{forSustainability ? " · year incl. open decisions: CO₂ targets" : ", same quantities"}
      </div>
    </Card>
  );
  const costCard = (
    <Card className="dash-card" size="small">
      <div className="kpi-label"><EuroOutlined /> {stats.extraCostEur < 0 ? "Savings from these decisions" : "Extra cost of these decisions"}</div>
      <div className={`kpi-value ${stats.extraCostEur < 0 ? "kpi-good" : stats.extraCostEur > 0 ? "kpi-warn" : ""}`}>
        {stats.extraCostEur < 0 ? <CheckCircleOutlined /> : null} {eur(Math.abs(stats.extraCostEur))}
      </div>
      <div className="kpi-sub">
        {stats.decisions.map((d) => `${part(d.partId).toLowerCase()} ${costChange(d.extraCostEur)}`).join(" · ")}
      </div>
    </Card>
  );

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={`Results, ${stats.period.label}`}
        subtitle="How much CO₂ you bought against the target path, and what the supplier switches decided in Fairweigh changed."
        source="Sources: purchase orders in the client ERP, decision log"
      />

      <FilterBar options={options} value={active} onChange={setFilter} products={products} />

      {/* One page for every role (20 Nov 2026); only the third tile differs: data quality for Sarah, spend for buyers. */}
      <div className="kpi-grid kpi-grid-4">
        <Card className="dash-card" size="small">
          <div className="kpi-label"><CloudOutlined /> CO₂e purchased, {stats.period.label} (Scope 3, cat. 1)</div>
          <div className="kpi-value">{formatNumber(purchased.co2Tonnes, 1)} t</div>
          <div className="kpi-sub">
            {trend !== null && purchased.previous ? (
              <span className={trend <= 0 ? "delta delta-better" : "delta delta-worse"}>
                {trend <= 0 ? "↓" : "↑"} {formatNumber(Math.abs(trend), 1)} % {trend <= 0 ? "lower" : "higher"} vs {purchased.previous.period.label} (
                {formatNumber(purchased.previous.co2Tonnes, 1)} t)
              </span>
            ) : (
              "No orders in the period before"
            )}
          </div>
        </Card>
        {avoidedCard}
        {forSustainability ? (
          <Card className="dash-card" size="small">
            <div className="kpi-label"><SafetyCertificateOutlined /> Spend with supplier-specific CO₂ data, {stats.period.label}</div>
            <div className={`kpi-value ${share === null ? "" : share >= 80 ? "kpi-good" : share >= 50 ? "kpi-warn" : "kpi-bad"}`}>
              {share === null ? "—" : `${formatNumber(share, 0)} %`}
            </div>
            <div className="kpi-sub">
              {purchased.previous?.supplierSpecificSpendPercent != null ? `${purchased.previous.period.label}: ${formatNumber(purchased.previous.supplierSpecificSpendPercent, 0)} % · ` : ""}
              rest estimated or industry average
            </div>
          </Card>
        ) : (
          <Card className="dash-card" size="small">
            <div className="kpi-label"><EuroOutlined /> Spend, {stats.period.label}</div>
            <div className="kpi-value">{eur(purchased.spendEur)}</div>
            {/* No good or bad colour: more spend can simply mean more orders. */}
            <div className="kpi-sub">
              {spendTrend !== null && purchased.previous
                ? `${spendTrend <= 0 ? "↓" : "↑"} ${formatNumber(Math.abs(spendTrend), 1)} % ${spendTrend <= 0 ? "lower" : "higher"} vs ${purchased.previous.period.label} (${eur(purchased.previous.spendEur)})`
                : "No orders in the period before"}
            </div>
          </Card>
        )}
        {costCard}
      </div>

      {path.length > 1 && (
        <Card
          className="dash-card"
          size="small"
          title={
            <span>
              CO₂ per month vs target path, {formatMonth(`${path[0]!.month}-01`)} – {formatMonth(`${path.at(-1)!.month}-01`)}
              {active.partId ? ", one product" : ""}{" "}
              <Tooltip title="t CO₂e per month from purchase orders × CO₂ per piece. Dashed: the 2025 average reduced by 4.2 % per year (SBTi 1.5 °C cross-sector rate). Shows the 12 months up to the end of the chosen period (a longer period in full); the chosen period is shaded.">
                <InfoCircleOutlined aria-label="How this chart works" style={{ color: BRAND.textSecondary }} />
              </Tooltip>
            </span>
          }
          extra={
            pathGap !== null ? (
              <Typography.Text style={{ fontSize: 12 }}>
                {stats.period.label}: {formatNumber(Math.abs(pathGap), 0)} % {pathGap <= 0 ? "below" : "above"} the path
              </Typography.Text>
            ) : null
          }
        >
          <Co2TargetChart points={path} width={1360} height={260} highlight={active.period} />
        </Card>
      )}

      {/* Next best actions and the decisions side by side (20 Nov 2026): what to do next, what was done. */}
      <div className="sus-grid sus-grid-stretch">
        <Card
          className="dash-card"
          size="small"
          title={
            <span>
              Next best actions, cheapest CO₂ first{" "}
              <InfoTip
                label="next best actions"
                title="Supplier switches ranked by cost per tonne CO₂ avoided: today's quotations against today's suppliers, at last year's quantities. Left out: excluded offers, switches already decided in Fairweigh, and all switches for a product whose latest decision kept the current supplier."
              />
            </span>
          }
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Click a supplier for its details
            </Typography.Text>
          }
          styles={{ body: { padding: 0 } }}
        >
          {options2 === null ? null : (
            <AbatementTable
              options={withoutDecidedSwitches(active.partId ? options2.filter((o) => o.partId === active.partId) : options2, log)}
              name={name}
              part={part}
              onOpenSupplier={onOpenSupplier}
            />
          )}
        </Card>

        {/* One table instead of "Decisions behind the purchases" and "Latest recorded decisions" (20 Nov 2026),
            which listed the same decisions twice. */}
        <Card
          className="dash-card"
          size="small"
          title={
            <span>
              Decisions in Fairweigh{" "}
              <InfoTip
                label="the decisions"
                title={`Latest decisions from the decision log. CO₂e avoided = (old - new CO₂ per piece) × quantity ordered in ${stats.period.label}; cost change = (new - old unit price) × quantity. Old values come from the replaced supplier's price and CO₂ record. Every decision keeps its reason, weights, ranking and sources, so it can be explained in an audit.`}
              />
            </span>
          }
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Avoided and cost: orders in {stats.period.label} · click a row for the record
            </Typography.Text>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table<DecisionRecord>
            size="small"
            pagination={false}
            rowKey="recordId"
            dataSource={decisionRows}
            scroll={{ x: 600 }}
            className="table-clickable"
            onRow={(r) => ({ onClick: () => onOpenDecision(r) })}
            locale={{ emptyText: "No decisions recorded yet" }}
            columns={[
              { title: "Date", key: "d", width: 104, render: (_, r) => formatDay(r.recordedAt) },
              {
                title: "Switch",
                key: "s",
                render: (_, r) => {
                  const impact = impactOf(r.recordId);
                  const from = impact?.replacedSupplierId ?? r.vsCurrent?.supplierId ?? null;
                  return (
                    <Flex vertical align="start">
                      <strong>{part(r.partId)}</strong>
                      <span>
                        {from && from !== r.chosenSupplierId && (
                          <>
                            {name(from)} <ArrowRightOutlined aria-label="to" />{" "}
                          </>
                        )}
                        <Button
                          type="link"
                          size="small"
                          className="inline-link"
                          style={{ fontSize: "inherit" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenSupplier(r.chosenSupplierId);
                          }}
                        >
                          {name(r.chosenSupplierId)}
                        </Button>
                      </span>
                    </Flex>
                  );
                },
              },
              {
                title: "CO₂e avoided",
                key: "t",
                align: "right",
                width: 100,
                render: (_, r) => {
                  const impact = impactOf(r.recordId);
                  return impact ? (
                    `${formatNumber(impact.avoidedTonnes, 1)} t`
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      no orders
                    </Typography.Text>
                  );
                },
              },
              {
                title: "Cost change",
                key: "c",
                align: "right",
                width: 105,
                render: (_, r) => {
                  const impact = impactOf(r.recordId);
                  return impact ? costChange(impact.extraCostEur) : "—";
                },
              },
              {
                title: "Recommendation",
                key: "r",
                width: 120,
                render: (_, r) =>
                  r.followsRecommendation ? (
                    <span>
                      <CheckCircleOutlined /> Followed
                    </span>
                  ) : (
                    <span>
                      <SwapOutlined /> Differs, reason given
                    </span>
                  ),
              },
            ]}
          />
        </Card>
      </div>

      {!forSustainability && <PurchaseOrdersCard orders={periodOrders} periodLabel={stats.period.label} name={(id) => supplierNames[id] ?? id} part={part} />}
    </Flex>
  );
}
