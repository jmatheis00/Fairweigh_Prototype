"use client";

import { ArrowDownOutlined, ArrowRightOutlined, CalculatorOutlined, CheckCircleOutlined, CloudOutlined, EuroOutlined, InfoCircleOutlined, SafetyCertificateOutlined, SwapOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Table, Tag, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { abatementOptions, co2TargetPath, formatDay, impactStats, purchasedCo2, type AbatementOption, periodOptions, type DecisionRecord, type DemoSettings, type PurchaseOrderRecord } from "@scc/shared";
import { api } from "@/lib/api";
import { formatMonth, formatNumber, shortPartName, formatEur, formatSignedEur } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { PageHeader } from "./page-header";
import { AbatementTable, Co2TargetChart } from "./analytics-charts";
import { BRAND } from "@/lib/theme";
import { FilterBar, defaultFilter, type StatsFilter } from "./filter-bar";

const eur = (n: number, digits = 0) => formatEur(n, digits);
/** A cost change in words, so a saving never reads as a negative cost. */
const costChange = (n: number) => (n < 0 ? `saves ${formatEur(-n, 0)}` : n > 0 ? `costs ${formatEur(n, 0)} more` : "same cost");
const signedEur = (n: number) => formatSignedEur(n, 0);

interface Props {
  /** Opens a decision in the Decision Log, or a supplier's details in a side panel (the page stays). */
  onOpenDecision: (record: DecisionRecord) => void;
  onOpenSupplier: (supplierId: string) => void;
  settings: DemoSettings;
  /** Decision log: examples plus the recorded decisions. */
  log: DecisionRecord[];
  supplierNames: Record<string, string>;
  /**
   * Sarah's single Results page (decision 20 Nov 2026): purchased CO₂ against the target path plus what the decisions
   * changed, in one page instead of two tabs. The category manager keeps the two tabs.
   */
  forSustainability?: boolean;
}

/** What the Fairweigh decisions cost and what they avoided; for Sarah also purchased CO₂ against the target path. */
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
  const recent = [...productLog].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 6);
  const productOrders = active.partId ? orders.filter((o) => o.partId === active.partId) : orders;
  const purchased = purchasedCo2(productOrders, active.period);
  const trend =
    purchased.previous && purchased.previous.co2Tonnes > 0
      ? Math.round(((purchased.co2Tonnes - purchased.previous.co2Tonnes) / purchased.previous.co2Tonnes) * 1000) / 10
      : null;
  const path = co2TargetPath(productOrders);
  const lastQuarter = path.slice(-3);
  const pathGap = lastQuarter.length
    ? (lastQuarter.reduce((a, p) => a + p.actualTonnes, 0) / lastQuarter.reduce((a, p) => a + p.targetTonnes, 0) - 1) * 100
    : null;
  const share = purchased.supplierSpecificSpendPercent;

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
        title={forSustainability ? `Results, ${stats.period.label}` : `Results of Fairweigh decisions, ${stats.period.label}`}
        subtitle={
          forSustainability
            ? "How much CO₂ you bought against the target path, and what the supplier switches decided in Fairweigh changed."
            : "What the supplier switches decided in Fairweigh changed in CO₂ and in cost."
        }
        source="Sources: purchase orders in the client ERP, decision log"
      />

      <FilterBar options={options} value={active} onChange={setFilter} products={products} />

      {forSustainability ? (
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
          {costCard}
        </div>
      ) : (
      <div className="kpi-grid kpi-grid-4">
        <Card className="dash-card" size="small">
          <div className="kpi-label"><SwapOutlined /> Supplier switches decided in Fairweigh</div>
          <div className="kpi-value">{stats.decisions.length}</div>
          <div className="kpi-sub">
            {stats.recordedDecisions} decisions in the log
            {stats.followsRecommendationPercent !== null ? ` · ${formatNumber(stats.followsRecommendationPercent, 0)} % follow the recommendation` : ""}
          </div>
        </Card>
        {avoidedCard}
        {costCard}
        <Card className="dash-card kpi-main" size="small">
          <div className="kpi-label"><CalculatorOutlined /> {stats.costPerTonneEur !== null && stats.costPerTonneEur < 0 ? "Saved per tonne CO₂e avoided" : "Cost per tonne CO₂e avoided"}</div>
          <div className={`kpi-value ${stats.costPerTonneEur !== null && stats.costPerTonneEur < 0 ? "kpi-good" : ""}`}>
            {stats.costPerTonneEur === null ? "—" : eur(Math.abs(stats.costPerTonneEur))}
          </div>
          <div className="kpi-sub">
            At the CO₂ price of the rules ({settings.co2PricePerTonneEur} €/t) the avoided CO₂ is worth {eur(stats.co2ValueEur)} · information only
          </div>
        </Card>
      </div>
      )}

      {forSustainability && path.length > 1 && (
        <Card
          className="dash-card"
          size="small"
          title={
            <span>
              CO₂ per month vs target path, {formatMonth(`${path[0]!.month}-01`)} – {formatMonth(`${path.at(-1)!.month}-01`)}
              {active.partId ? ", one product" : ""}{" "}
              <Tooltip title="t CO₂e per month from purchase orders × CO₂ per piece. Dashed: the 2025 average reduced by 4.2 % per year (SBTi 1.5 °C cross-sector rate). Follows the product filter; shows all months.">
                <InfoCircleOutlined aria-label="How this chart works" style={{ color: BRAND.textSecondary }} />
              </Tooltip>
            </span>
          }
          extra={
            pathGap !== null ? (
              <Typography.Text style={{ fontSize: 12 }}>
                Last quarter: {formatNumber(Math.abs(pathGap), 0)} % {pathGap <= 0 ? "below" : "above"} the path
              </Typography.Text>
            ) : null
          }
        >
          <Co2TargetChart points={path} width={1360} height={260} />
        </Card>
      )}

      <Card
        className="dash-card"
        size="small"
        title="Next best actions: supplier switches by cost per tonne CO₂ avoided"
        styles={{ body: { padding: 0 } }}
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Today&apos;s quotations vs today&apos;s suppliers · cheapest CO₂ first · excluded offers left out
          </Typography.Text>
        }
      >
        {options2 === null ? null : (
          <AbatementTable
            options={active.partId ? options2.filter((o) => o.partId === active.partId) : options2}
            name={name}
            part={part}
          />
        )}
      </Card>

      <div className="sus-grid">
        <Card
          className="dash-card"
          size="small"
          title={`Decisions behind the purchases, ${stats.period.label}`}
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Click a row for the full record
            </Typography.Text>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            size="small"
            pagination={false}
            rowKey="decisionId"
            dataSource={stats.decisions}
            className="table-clickable"
            onRow={(d) => {
              // The decision id in the purchase orders is the record id in the decision log.
              const record = log.find((r) => r.recordId === d.decisionId);
              return record ? { onClick: () => onOpenDecision(record) } : {};
            }}
            locale={{ emptyText: "No supplier switches decided in Fairweigh in this period" }}
            scroll={{ x: 620 }}
            columns={[
              {
                title: "Product",
                key: "p",
                render: (_, d) => (
                  <Flex vertical>
                    <span>{part(d.partId)}</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {d.decisionId}
                    </Typography.Text>
                  </Flex>
                ),
              },
              {
                title: "Switch",
                key: "s",
                render: (_, d) => (
                  <span>
                    {name(d.replacedSupplierId)} <ArrowRightOutlined aria-label="to" /> {name(d.supplierId)}
                  </span>
                ),
              },
              { title: "Cost change", key: "c", align: "right", width: 110, render: (_, d) => signedEur(d.extraCostEur) },
              { title: "CO₂e avoided", key: "t", align: "right", width: 110, render: (_, d) => `${formatNumber(d.avoidedTonnes, 1)} t` },
              {
                title: "Per tonne",
                key: "pt",
                align: "right",
                width: 120,
                render: (_, d) =>
                  d.costPerTonneEur === null ? "—" : d.costPerTonneEur < 0 ? <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>saves money</Tag> : eur(d.costPerTonneEur),
              },
            ]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", padding: "8px 12px 10px" }}>
            Cost change = (new - old unit price) × quantity ordered; CO₂e avoided = (old - new CO₂ per piece) × quantity. Old values come from
            the replaced supplier&apos;s price and CO₂ record.
          </Typography.Text>
        </Card>

        <Card
          className="dash-card"
          size="small"
          title="Latest recorded decisions (all dates)"
          extra={
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Click a row for the full record
            </Typography.Text>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            size="small"
            pagination={false}
            rowKey="recordId"
            dataSource={recent}
            scroll={{ x: 560 }}
            className="table-clickable"
            onRow={(r) => ({ onClick: () => onOpenDecision(r) })}
            columns={[
              { title: "Date", key: "d", width: 110, render: (_, r) => formatDay(r.recordedAt) },
              { title: "Product", key: "p", render: (_, r) => part(r.partId) },
              {
                title: "Chosen",
                key: "c",
                render: (_, r) => (
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
                ),
              },
              {
                title: "Recommendation",
                key: "r",
                width: 150,
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
              { title: "By", key: "b", width: 90, render: (_, r) => r.decidedBy?.name ?? "—" },
            ]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", padding: "8px 12px 10px" }}>
            Every decision keeps its reason, weights, ranking and sources in the decision log, so it can be explained in an audit.
          </Typography.Text>
        </Card>
      </div>
    </Flex>
  );
}
