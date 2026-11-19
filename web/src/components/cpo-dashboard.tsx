"use client";

import { AimOutlined, ArrowDownOutlined, ArrowRightOutlined, ArrowUpOutlined, CalendarOutlined, CheckCircleOutlined, CloudOutlined, EuroOutlined, FundOutlined, LineChartOutlined, SafetyCertificateOutlined, SwapOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Progress, Select, Table, Tag, Typography } from "antd";
import { SidePanel } from "./side-panel";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  cockpitUse,
  needsContractAction,
  seriousRiskSupplierIds,
  co2Intensity,
  contractsEnding,
  formatDay,
  impactStats,
  inPeriod,
  periodOptions,
  previousPeriod,
  quarterOf,
  type CertificateRecord,
  type DecisionRecord,
  type DemoSettings,
  type ErpRecord,
  type PurchaseOrderRecord,
  type RatingRecord,
  type TargetOverview,
  type TargetRow,
} from "@scc/shared";
import { api } from "@/lib/api";
import { useIsPhone } from "@/lib/use-phone";
import { formatNumber, formatEur } from "@/lib/labels";
import { InfoTip } from "./info-tip";
import { PageHeader } from "./page-header";
import { FilterBar, defaultFilter, type StatsFilter } from "./filter-bar";
import { Sparkline } from "./analytics-charts";
import { TargetStatusTag } from "./targets-page";
import { BRAND } from "@/lib/theme";

interface Props {
  settings: DemoSettings;
  orders: PurchaseOrderRecord[];
  log: DecisionRecord[];
  overview: TargetOverview;
  onOpenSupplier: (supplierId: string) => void;
}

type Drill = "co2" | "target" | "savings" | "risks" | "use" | "intensity" | "contracts" | null;

/** Certificates are checked against the date of the source data. */
const DEMO_DATE = "2026-11-06";
const eur = (n: number) => formatEur(Math.abs(n), 0);
const co2Of = (o: PurchaseOrderRecord) => (o.pcfKgPerPiece * o.quantity) / 1000;
const kg = (n: number | null) => (n === null ? "—" : `${formatNumber(n, 2)} kg`);

/** A tile that opens its drill-down; usable by keyboard. */
function Tile({ icon, label, info, children, onOpen, warning }: { icon: ReactNode; label: string; info: string; children: ReactNode; onOpen: () => void; warning?: string }) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <Card
      className="dash-card cpo-tile"
      size="small"
      hoverable
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey}
      aria-label={`${label}: open details`}
      style={{ height: "100%" }}
      styles={{ body: { display: "flex", flexDirection: "column", height: "100%" } }}
    >
      <Flex justify="space-between" align="flex-start" gap={8}>
        <div className="kpi-label">
          {icon} {label} <InfoTip label={label} title={info} />
        </div>
        {warning && (
          <Tag color="warning" icon={<WarningOutlined />} style={{ marginInlineEnd: 0, flexShrink: 0 }}>
            {warning}
          </Tag>
        )}
      </Flex>
      {children}
      <div className="cpo-drill" style={{ marginTop: "auto", paddingTop: 8 }}>
        Details <ArrowRightOutlined />
      </div>
    </Card>
  );
}

/** Katrin's start page (expert interviews, 10 Nov 2026): four tiles with drill-down and the top 10 suppliers. No single materials, no employee targets. */
export function CpoDashboard({ settings, orders, log, overview, onOpenSupplier }: Props) {
  const [erp, setErp] = useState<ErpRecord[]>([]);
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill>(null);
  // Phones: the commodity group moves under the supplier name, so the figures stay on screen.
  const isPhone = useIsPhone();

  useEffect(() => {
    Promise.all([api.erpList(), api.ratingList(), api.certificates()])
      .then(([e, r, c]) => {
        setErp(e);
        setRatings(r);
        setCertificates(c);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const byId = useMemo(() => new Map(erp.map((e) => [e.supplierId, e])), [erp]);
  const name = (id: string) => byId.get(id)?.supplierName ?? id;
  const groupOf = useMemo(() => {
    const map = new Map(settings.catalog.map((p) => [p.partId, p.category]));
    return (partId: string) => map.get(partId) ?? "Other";
  }, [settings.catalog]);
  const categoryOf = groupOf;

  // Filters (12 Nov 2026): period (default: the latest quarter with orders) and commodity group, never a single material.
  const [filter, setFilter] = useState<StatsFilter | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const options = useMemo(() => periodOptions(orders.map((o) => o.orderDate)), [orders]);
  const active = filter ?? (options ? defaultFilter(options) : null);
  const groups = useMemo(() => overview.byGroup.map((g) => g.key), [overview]);
  const groupOrders = useMemo(() => (group ? orders.filter((o) => groupOf(o.partId) === group) : orders), [orders, group, groupOf]);
  const groupLog = useMemo(() => (group ? log.filter((d) => groupOf(d.partId) === group) : log), [log, group, groupOf]);

  const co2 = useMemo(() => {
    if (!active) return null;
    const before = previousPeriod(active.period);
    const now = groupOrders.filter((o) => inPeriod(o.orderDate, active.period)).reduce((a, o) => a + co2Of(o), 0);
    const prev = groupOrders.filter((o) => inPeriod(o.orderDate, before)).reduce((a, o) => a + co2Of(o), 0);
    return { now, prev, before, change: prev > 0 ? ((now - prev) / prev) * 100 : null };
  }, [groupOrders, active]);
  const impact = useMemo(
    () => (active ? impactStats(groupOrders, groupLog, settings.co2PricePerTonneEur, active.period) : null),
    [groupOrders, groupLog, settings.co2PricePerTonneEur, active],
  );
  const quarterSeries = useMemo(() => {
    const byQ = new Map<string, number>();
    for (const o of groupOrders) byQ.set(quarterOf(o.orderDate), (byQ.get(quarterOf(o.orderDate)) ?? 0) + co2Of(o));
    return [...byQ.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [groupOrders]);
  // New key figures (12 Nov 2026): cockpit use and return, CO₂ intensity and data quality, contracts ending soon.
  const use = useMemo(() => (active ? cockpitUse(groupLog, active.period) : null), [groupLog, active]);
  const intensity = useMemo(() => (active ? co2Intensity(groupOrders, active.period) : null), [groupOrders, active]);
  const intensityRows = useMemo(() => {
    if (!active) return [];
    return [...new Set(groupOrders.map((o) => groupOf(o.partId)))]
      .map((g) => ({ group: g, ...co2Intensity(groupOrders.filter((o) => groupOf(o.partId) === g), active.period) }))
      .filter((r) => r.spendEur > 0)
      .sort((a, b) => b.co2Tonnes - a.co2Tonnes);
  }, [groupOrders, active, groupOf]);
  const ending = useMemo(() => contractsEnding(erp, DEMO_DATE, 6).filter((c) => !group || c.category === group), [erp, group]);
  const decisionsInPeriod = useMemo(
    () => (active ? groupLog.filter((d) => inPeriod(d.recordedAt.slice(0, 10), active.period)).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)) : []),
    [groupLog, active],
  );

  // CO₂ of the period per commodity group and supplier (no single materials).
  const co2Rows = useMemo(() => {
    if (!active) return [];
    const map = new Map<string, { group: string; supplierId: string; tonnes: number }>();
    for (const o of groupOrders.filter((x) => inPeriod(x.orderDate, active.period))) {
      const g = groupOf(o.partId);
      const key = `${g}|${o.supplierId}`;
      const entry = map.get(key) ?? { group: g, supplierId: o.supplierId, tonnes: 0 };
      entry.tonnes += co2Of(o);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.tonnes - a.tonnes);
  }, [groupOrders, active, groupOf]);

  const co2ByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of co2Rows) map.set(r.group, (map.get(r.group) ?? 0) + r.tonnes);
    return [...map.entries()].map(([g, tonnes]) => ({ group: g, tonnes })).sort((a, b) => b.tonnes - a.tonnes);
  }, [co2Rows]);

  // Risks among active suppliers: certificates expired or expiring within 120 days, no rating, LkSG risk High.
  const riskRows = useMemo(() => {
    const active = erp.filter((e) => e.relationshipStatus === "Active contract");
    const rating = new Map(ratings.map((r) => [r.supplierId, r]));
    return active
      .map((e) => {
        const issues: string[] = [];
        for (const c of certificates.filter((x) => x.supplierId === e.supplierId)) {
          const days = (Date.parse(c.validUntil) - Date.parse(DEMO_DATE)) / 86_400_000;
          if (days < 0) issues.push(`${c.standard} expired`);
          else if (days <= 120) issues.push(`${c.standard} expires in ${Math.round(days)} days`);
        }
        const r = rating.get(e.supplierId);
        if (!r || r.sustainabilityScore === null) issues.push("No sustainability rating");
        if (r?.lksgCountryRisk === "High") issues.push("LkSG risk High");
        return { supplierId: e.supplierId, group: e.category, issues };
      })
      .filter((x) => x.issues.length > 0 && (!group || x.group === group));
  }, [erp, ratings, certificates, group]);
  // Serious cases only (16 Nov 2026): expired certificate or LkSG risk High; drives the warning tag on the tile.
  const seriousRisks = useMemo(() => {
    const ids = new Set(seriousRiskSupplierIds(erp, ratings, certificates, DEMO_DATE));
    return riskRows.filter((r) => ids.has(r.supplierId)).length;
  }, [erp, ratings, certificates, riskRows]);
  const activeSuppliers = erp.filter((e) => e.relationshipStatus === "Active contract" && (!group || e.category === group));

  // Top 10 active suppliers by purchase volume (annual spend in the ERP), with what Fairweigh decisions changed.
  const top10 = useMemo(() => {
    const perSupplier = new Map<string, { cost: number; tonnes: number }>();
    for (const d of impact?.decisions ?? []) {
      const entry = perSupplier.get(d.supplierId) ?? { cost: 0, tonnes: 0 };
      entry.cost += d.extraCostEur;
      entry.tonnes += d.avoidedTonnes;
      perSupplier.set(d.supplierId, entry);
    }
    return erp
      .filter((e) => e.relationshipStatus === "Active contract" && (e.annualSpendEur ?? 0) > 0 && (!group || e.category === group))
      .sort((a, b) => (b.annualSpendEur ?? 0) - (a.annualSpendEur ?? 0))
      .slice(0, 10)
      .map((e, i) => ({ rank: i + 1, erp: e, effect: perSupplier.get(e.supplierId) ?? null }));
  }, [erp, impact, group]);

  if (error) return <Alert type="error" showIcon title={`Dashboard data not available: ${error}`} />;
  if (!options || !active || !co2 || !impact || !use || !intensity) return null;

  const savings = -impact.extraCostEur;
  const change = co2.change;
  const target = (group ? overview.byGroup.find((g) => g.key === group) : null) ?? overview.company;
  const intensityChange =
    intensity.kgPerEur !== null && intensity.previousKgPerEur ? ((intensity.kgPerEur - intensity.previousKgPerEur) / intensity.previousKgPerEur) * 100 : null;
  const endingSpend = ending.reduce((a, c) => a + (c.annualSpendEur ?? 0), 0);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={`Procurement at a glance, ${active.period.label}`}
        subtitle={`CO₂, target, savings and risks ${group ? `for ${group}` : "across all commodity groups"}. Click a tile for the details.`}
        source="Sources: client ERP, rating partner, decision log"
      />

      <FilterBar
        options={options}
        value={active}
        onChange={setFilter}
        products={[]}
        hideProduct
        extra={
          <Select
            allowClear
            aria-label="Commodity group"
            placeholder="All commodity groups"
            value={group}
            onChange={(v: string | undefined) => setGroup(v ?? null)}
            style={{ width: 240 }}
            options={groups.map((g) => ({ value: g, label: g }))}
          />
        }
      />

      <div className="kpi-grid kpi-grid-4">
        <Tile
          icon={<CloudOutlined />}
          label={`CO₂e purchased, ${active.period.label}`}
          info="Product carbon footprint per piece times the quantity ordered, from the purchase orders in the ERP (Scope 3, category 1)."
          onOpen={() => setDrill("co2")}
        >
          <Flex align="center" justify="space-between" gap={8}>
            <div className="kpi-value">{formatNumber(co2.now, 1)} t</div>
            <Sparkline values={quarterSeries} label="CO₂e per quarter" />
          </Flex>
          <div className="kpi-sub">
            {co2.now === 0 && co2.prev === 0 ? (
              "No purchase orders in this period"
            ) : change === null ? (
              `no orders in ${co2.before.label}`
            ) : (
              <span className={change <= 0 ? "delta-better" : "delta-worse"}>
                {change < 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {formatNumber(Math.abs(change), 1)} % {change < 0 ? "lower" : "higher"} than{" "}
                {co2.before.label}
              </span>
            )}
          </div>
        </Tile>

        <Tile
          icon={<AimOutlined />}
          label={group ? `CO₂ target ${overview.year}: ${group}` : `Company CO₂ target ${overview.year}`}
          info="Avoided CO₂ from Fairweigh decisions this year against the target set by the Scope 3 manager. Always the whole year, whatever period is selected."
          onOpen={() => setDrill("target")}
        >
          <Flex align="center" justify="space-between" gap={8}>
            <div className="kpi-value">{target.percent} %</div>
            <TargetStatusTag status={target.status} />
          </Flex>
          <Progress percent={target.percent} showInfo={false} size="small" strokeColor={BRAND.primary} aria-hidden />
          <div className="kpi-sub">
            {formatNumber(target.achievedTonnes, 1)} of {formatNumber(target.targetTonnes, 0)} t CO₂e avoided
          </div>
        </Tile>

        <Tile
          icon={<EuroOutlined />}
          label={`${savings >= 0 ? "Cost savings" : "Extra cost"}, ${active.period.label}`}
          info="Price difference to the replaced supplier times the quantity ordered, for orders after Fairweigh decisions in the selected period."
          onOpen={() => setDrill("savings")}
        >
          <div className={`kpi-value ${savings > 0 ? "kpi-good" : savings < 0 ? "kpi-warn" : ""}`}>{eur(savings)}</div>
          <div className="kpi-sub">
            {impact.decisions.length} supplier switch{impact.decisions.length === 1 ? "" : "es"} · {formatNumber(impact.avoidedTonnes, 1)} t CO₂e avoided
          </div>
        </Tile>

        <Tile
          icon={<SafetyCertificateOutlined />}
          label="Supplier risks"
          info="Active suppliers with a certificate that has expired or expires within 120 days, without a sustainability rating, or with LkSG country risk High. Today's state, not bound to the period."
          onOpen={() => setDrill("risks")}
          warning={seriousRisks > 0 ? "Needs attention" : undefined}
        >
          <div className={`kpi-value ${seriousRisks > 0 ? "kpi-warn" : ""}`}>{riskRows.length}</div>
          <div className="kpi-sub">
            of {activeSuppliers.length} active suppliers ·{" "}
            {riskRows.filter((r) => r.issues.some((i) => i.includes("expire"))).length} with certificate issues
          </div>
        </Tile>
      </div>

      <div className="kpi-grid kpi-grid-3">
        <Tile
          icon={<FundOutlined />}
          label={`Fairweigh use, ${active.period.label}`}
          info="Decisions recorded in Fairweigh in the selected period, how many follow the recommendation, and what the supplier switches cost per tonne of CO₂ avoided."
          onOpen={() => setDrill("use")}
        >
          <div className="kpi-value">
            {use.decisions} decision{use.decisions === 1 ? "" : "s"}
          </div>
          <div className="kpi-sub">
            {use.followsRecommendationPercent === null ? "no decisions in this period" : `${use.followsRecommendationPercent} % follow the recommendation`}
            {impact.costPerTonneEur !== null &&
              ` · ${impact.costPerTonneEur < 0 ? `saves ${eur(impact.costPerTonneEur)}` : `costs ${eur(impact.costPerTonneEur)}`} per t CO₂e avoided`}
          </div>
        </Tile>

        <Tile
          icon={<LineChartOutlined />}
          label={`CO₂ intensity, ${active.period.label}`}
          info="kg CO₂e per euro spent: shows whether CO₂ falls through better suppliers or only through lower volume. Data quality: share of spend with supplier-specific CO₂ values, needed for Scope 3 reporting."
          onOpen={() => setDrill("intensity")}
        >
          <div className="kpi-value">{intensity.kgPerEur === null ? "—" : `${formatNumber(intensity.kgPerEur, 2)} kg / €`}</div>
          <div className="kpi-sub">
            {intensityChange !== null && (
              <span className={intensityChange <= 0 ? "delta-better" : "delta-worse"}>
                {intensityChange < 0 ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {formatNumber(Math.abs(intensityChange), 1)} %{" "}
                {intensityChange < 0 ? "lower" : "higher"} than {co2.before.label} ·{" "}
              </span>
            )}
            {intensity.supplierSpecificPercent === null ? "no spend in this period" : `${intensity.supplierSpecificPercent} % of spend with supplier-specific CO₂ data`}
          </div>
        </Tile>

        <Tile
          icon={<CalendarOutlined />}
          label="Contracts ending in 6 months"
          info="Contracts of active suppliers that end within the next six months: where a new tender, and with it a CO₂ lever, is coming up. Today's state, not bound to the period."
          onOpen={() => setDrill("contracts")}
          warning={needsContractAction(ending) ? "Action needed" : undefined}
        >
          <div className={`kpi-value ${needsContractAction(ending) ? "kpi-warn" : ""}`}>{ending.length}</div>
          <div className="kpi-sub">
            {ending.length === 0
              ? "No contract ends in the next 6 months"
              : `${eur(endingSpend)} spend per year · next: ${name(ending[0]!.supplierId)} in ${ending[0]!.daysLeft} days`}
          </div>
        </Tile>
      </div>

      <Card
        className="dash-card"
        size="small"
        title="Top 10 suppliers by purchase volume"
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Annual spend in the ERP · effect of Fairweigh decisions in {active.period.label} · click a supplier for details
          </Typography.Text>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          size="small"
          pagination={false}
          rowKey={(r) => r.erp.supplierId}
          dataSource={top10}
          columns={[
            { title: "#", key: "rank", width: 48, render: (_, r) => r.rank },
            {
              title: "Supplier",
              key: "name",
              render: (_, r) => (
                <Flex vertical align="flex-start">
                  <Button type="link" size="small" className="inline-link" style={{ fontSize: 14, textAlign: "left" }} onClick={() => onOpenSupplier(r.erp.supplierId)}>
                    {r.erp.supplierName}
                  </Button>
                  {isPhone && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {r.erp.category}
                    </Typography.Text>
                  )}
                </Flex>
              ),
            },
            ...(isPhone ? [] : [{ title: "Commodity group", key: "group", width: 220, render: (_: unknown, r: (typeof top10)[number]) => r.erp.category }]),
            { title: "Spend / year", key: "spend", width: 140, align: "right", render: (_, r) => eur(r.erp.annualSpendEur ?? 0) },
            {
              title: "Cost savings",
              key: "cost",
              width: 140,
              align: "right",
              render: (_, r) =>
                r.effect === null ? (
                  <Typography.Text type="secondary">no switch</Typography.Text>
                ) : r.effect.cost <= 0 ? (
                  eur(-r.effect.cost)
                ) : (
                  `${eur(r.effect.cost)} more`
                ),
            },
            {
              title: "CO₂e avoided",
              key: "co2",
              width: 130,
              align: "right",
              render: (_, r) => (r.effect === null ? <Typography.Text type="secondary">no switch</Typography.Text> : `${formatNumber(r.effect.tonnes, 1)} t`),
            },
          ]}
        />
      </Card>

      <SidePanel
        open={drill !== null}
        contentKey={drill}
        onClose={() => setDrill(null)}
        size={760}
        title={
          drill === "co2"
            ? `CO₂e purchased, ${active.period.label}: by commodity group and supplier`
            : drill === "target"
              ? `CO₂ target ${overview.year}: by commodity group`
              : drill === "savings"
                ? `Supplier switches decided in Fairweigh, ${active.period.label}`
                : drill === "use"
                  ? `Decisions recorded in Fairweigh, ${active.period.label}`
                  : drill === "intensity"
                    ? `CO₂ intensity and data quality, ${active.period.label}: by commodity group`
                    : drill === "contracts"
                      ? `Contracts ending in the next 6 months (${ending.length})`
                      : `Supplier risks (${riskRows.length})`
        }
      >
        {drill === "co2" && (
          <Flex vertical gap={16}>
            <div role="img" aria-label="CO₂e purchased per commodity group">
              <Typography.Text strong>t CO₂e per commodity group</Typography.Text>
              <Flex vertical gap={8} style={{ marginTop: 8 }}>
                {co2ByGroup.map((g) => (
                  <div key={g.group}>
                    <Flex justify="space-between" gap={8}>
                      <Typography.Text>{g.group}</Typography.Text>
                      <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatNumber(g.tonnes, 1)} t CO₂e · {formatNumber((g.tonnes / (co2.now || 1)) * 100, 0)} %
                      </Typography.Text>
                    </Flex>
                    <Progress percent={(g.tonnes / (co2ByGroup[0]?.tonnes || 1)) * 100} showInfo={false} size="small" strokeColor={BRAND.primary} aria-hidden />
                  </div>
                ))}
              </Flex>
            </div>
          <Table
            size="small"
            pagination={false}
            rowKey={(r) => `${r.group}|${r.supplierId}`}
            dataSource={co2Rows}
            columns={[
              { title: "Commodity group", dataIndex: "group" },
              { title: "Supplier", key: "s", render: (_, r) => name(r.supplierId) },
              { title: "t CO₂e", key: "t", align: "right", render: (_, r) => formatNumber(r.tonnes, 1) },
              {
                title: "Share",
                key: "p",
                align: "right",
                render: (_, r) => `${formatNumber((r.tonnes / (co2.now || 1)) * 100, 0)} %`,
              },
            ]}
          />
          </Flex>
        )}
        {drill === "target" && (
          <Table<TargetRow>
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={overview.byGroup}
            columns={[
              { title: "Commodity group", dataIndex: "key" },
              { title: "Target", key: "t", align: "right", render: (_, r) => `${formatNumber(r.targetTonnes, 0)} t` },
              { title: "Achieved", key: "a", align: "right", render: (_, r) => `${formatNumber(r.achievedTonnes, 1)} t` },
              { title: "Status", key: "s", render: (_, r) => <TargetStatusTag status={r.status} /> },
            ]}
          />
        )}
        {drill === "savings" && (
          <Table
            size="small"
            pagination={false}
            rowKey="decisionId"
            dataSource={impact.decisions}
            locale={{ emptyText: "No supplier switches in this period" }}
            columns={[
              { title: "Commodity group", key: "g", render: (_, d) => categoryOf(d.partId) },
              {
                title: "Switch",
                key: "s",
                render: (_, d) => (
                  <span>
                    {name(d.replacedSupplierId)} <ArrowRightOutlined aria-label="to" /> {name(d.supplierId)}
                  </span>
                ),
              },
              { title: "Cost", key: "c", align: "right", render: (_, d) => (d.extraCostEur <= 0 ? `saves ${eur(d.extraCostEur)}` : `${eur(d.extraCostEur)} more`) },
              { title: "CO₂e avoided", key: "t", align: "right", render: (_, d) => `${formatNumber(d.avoidedTonnes, 1)} t` },
            ]}
          />
        )}
        {drill === "use" && (
          <Table
            size="small"
            pagination={false}
            rowKey="recordId"
            dataSource={decisionsInPeriod}
            locale={{ emptyText: "No decisions recorded in this period" }}
            columns={[
              { title: "Date", key: "d", width: 110, render: (_, d) => formatDay(d.recordedAt.slice(0, 10)) },
              { title: "Commodity group", key: "g", render: (_, d) => groupOf(d.partId) },
              {
                title: "Awarded to",
                key: "s",
                render: (_, d) => (
                  <Button type="link" size="small" className="inline-link" style={{ fontSize: 14 }} onClick={() => onOpenSupplier(d.chosenSupplierId)}>
                    {name(d.chosenSupplierId)}
                  </Button>
                ),
              },
              {
                title: "Recommendation",
                key: "r",
                width: 150,
                render: (_, d) =>
                  d.followsRecommendation ? (
                    <span>
                      <CheckCircleOutlined /> Followed
                    </span>
                  ) : (
                    <span>
                      <SwapOutlined /> Differs, reason given
                    </span>
                  ),
              },
              { title: "By", key: "b", width: 90, render: (_, d) => d.decidedBy?.name ?? "—" },
            ]}
          />
        )}
        {drill === "intensity" && (
          <Table
            size="small"
            pagination={false}
            rowKey="group"
            dataSource={intensityRows}
            locale={{ emptyText: "No purchase orders in this period" }}
            columns={[
              { title: "Commodity group", dataIndex: "group" },
              { title: "Spend", key: "sp", align: "right", render: (_, r) => eur(r.spendEur) },
              { title: "t CO₂e", key: "t", align: "right", render: (_, r) => formatNumber(r.co2Tonnes, 1) },
              { title: "kg CO₂e / €", key: "k", align: "right", render: (_, r) => kg(r.kgPerEur).replace(" kg", "") },
              {
                title: "Supplier-specific CO₂ data",
                key: "q",
                align: "right",
                render: (_, r) => (r.supplierSpecificPercent === null ? "—" : `${r.supplierSpecificPercent} % of spend`),
              },
            ]}
          />
        )}
        {drill === "contracts" && (
          <Table
            size="small"
            pagination={false}
            rowKey="supplierId"
            dataSource={ending}
            locale={{ emptyText: "No contract ends in the next 6 months" }}
            columns={[
              {
                title: "Supplier",
                key: "s",
                render: (_, c) => (
                  <Button type="link" size="small" className="inline-link" style={{ fontSize: 14 }} onClick={() => onOpenSupplier(c.supplierId)}>
                    {name(c.supplierId)}
                  </Button>
                ),
              },
              { title: "Commodity group", dataIndex: "category" },
              { title: "Contract ends", key: "e", width: 120, render: (_, c) => formatDay(c.contractEnd) },
              { title: "In", key: "d", width: 90, align: "right", render: (_, c) => `${c.daysLeft} days` },
              { title: "Spend / year", key: "sp", width: 130, align: "right", render: (_, c) => (c.annualSpendEur ? eur(c.annualSpendEur) : "—") },
            ]}
          />
        )}
        {drill === "risks" && (
          <Table
            size="small"
            pagination={false}
            rowKey="supplierId"
            dataSource={riskRows}
            columns={[
              {
                title: "Supplier",
                key: "s",
                render: (_, r) => (
                  <Flex vertical align="flex-start">
                    <Button type="link" size="small" className="inline-link" style={{ fontSize: 14, textAlign: "left" }} onClick={() => onOpenSupplier(r.supplierId)}>
                      {name(r.supplierId)}
                    </Button>
                    {isPhone && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {r.group}
                      </Typography.Text>
                    )}
                  </Flex>
                ),
              },
              ...(isPhone ? [] : [{ title: "Commodity group", dataIndex: "group", width: 170 }]),
              {
                title: "Issues",
                key: "i",
                render: (_, r) => (
                  <Flex wrap gap={4}>
                    {r.issues.map((i) => (
                      <Tag key={i} style={{ marginInlineEnd: 0 }}>
                        {i}
                      </Tag>
                    ))}
                  </Flex>
                ),
              },
            ]}
          />
        )}
      </SidePanel>
    </Flex>
  );
}
