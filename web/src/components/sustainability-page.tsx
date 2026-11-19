"use client";

import { AuditOutlined, CheckCircleOutlined, MailOutlined, ExclamationCircleOutlined, InfoCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Select, Table, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  formatDay,
  RISK_MONITORING,
  supplierBaseStats,
  sustainabilityStats,
  type DemoSettings,
  type DocumentRecord,
  type ErpRecord,
  type PcfRecord,
  type PurchaseOrderRecord,
  type RatingRecord,
  type RiskAlert,
} from "@scc/shared";
import { api } from "@/lib/api";
import { requestMailto, riskRequest, riskRequestText } from "@/lib/data-request";
import { formatNumber } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { InfoTip } from "./info-tip";
import { PageHeader } from "./page-header";
import { RiskLevelTag } from "./risk-level-tag";
import { DataRequestsCard, type SupplierDataView } from "./data-requests-card";
import { SupplierBaseFacts, SupplierBaseMap } from "./analytics-charts";
import { usePartnerData } from "@/lib/partner-data";
import { FLAG_NAMES, FlagTags, SupplierNameLink, relationshipLabel } from "@/lib/supplier-labels";
import { ANY_FLAG, type SupplierFilter } from "./suppliers-page";
import { BRAND } from "@/lib/theme";


interface Data {
  orders: PurchaseOrderRecord[];
  erp: ErpRecord[];
  ratings: RatingRecord[];
  pcf: PcfRecord[];
  fines: DocumentRecord[];
}


/** Status class for a share: at least `good` % is good, at least `warn` % needs attention, below is bad. */
function toneOf(value: number | null, good: number, warn: number): string {
  if (value === null) return "";
  return value >= good ? "kpi-good" : value >= warn ? "kpi-warn" : "kpi-bad";
}

/**
 * Sarah's view of today (decision 20 Nov 2026): which suppliers lack data, which carry risks, and how current suppliers
 * compare with their category. No period filter: everything over time (purchased CO₂, target path) is on Results.
 */
export function SustainabilityPage({
  settings,
  onOpenSupplier,
  onShowSuppliers,
}: {
  settings: DemoSettings;
  /** Opens the supplier side panel; `context` is shown at its top. */
  onOpenSupplier?: (supplierId: string, context?: React.ReactNode) => void;
  /** Opens the suppliers page with these filters ("Show all in Suppliers"). */
  onShowSuppliers?: (filter: SupplierFilter) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filters sit on the supplier lists they filter (feedback 17 Nov 2026); no period filter (20 Nov 2026).
  const [dataRelationship, setDataRelationship] = useState<string | null>(null);
  const [riskRelationship, setRiskRelationship] = useState<string | null>(null);
  const [flagFilter, setFlagFilter] = useState<string | null>(null);
  // Supplier data view; a KPI tile can switch it (19 Nov 2026).
  const [dataView, setDataView] = useState<SupplierDataView>("insufficient");
  const partner = usePartnerData().data;

  useEffect(() => {
    Promise.all([api.purchaseOrders(), api.erpList(), api.ratingList(), api.pcfList(), api.fineNotices()])
      .then(([orders, erp, ratings, pcf, fines]) => setData({ orders, erp, ratings, pcf, fines }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // The latest quarter of purchases only feeds "Needs update" (CO₂ values behind what we buy now).
  const stats = useMemo(
    () =>
      data
        ? sustainabilityStats({
            orders: data.orders,
            erp: data.erp,
            ratings: data.ratings,
            pcf: data.pcf,
            documents: data.fines,
            today: dayjs().format("YYYY-MM-DD"),
            co2MaxAgeDays: settings.co2MaxAgeDays,
          })
        : null,
    [data, settings.co2MaxAgeDays],
  );

  if (error) return <Alert type="error" showIcon title={`Sustainability data not available: ${error}`} />;
  if (!data || !stats) return null;

  const erpOf = (id: string) => data.erp.find((e) => e.supplierId === id);
  const ratingOf = (id: string) => data.ratings.find((r) => r.supplierId === id);
  const name = (id: string) => shortName(erpOf(id)?.supplierName ?? id);
  // Who is behind the risk counts (active suppliers), so the tile can list them on click.
  const activeIds = new Set(data.erp.filter((e) => e.relationshipStatus === "Active contract").map((e) => e.supplierId));
  const activeRatings = data.ratings.filter((r) => activeIds.has(r.supplierId));
  const riskLists = {
    lksgHigh: activeRatings.filter((r) => r.lksgCountryRisk === "High").map((r) => r.supplierId),
    controversies: activeRatings.filter((r) => r.controversies && r.controversies !== "None known").map((r) => r.supplierId),
    violations: [...new Set(data.fines.map((d) => d.supplierId))].filter((id) => activeIds.has(id)),
  };
  const relationships = [...new Set(data.erp.map((e) => e.relationshipStatus).filter(Boolean))].sort();
  const hasRelationship = (id: string, wanted: string | null) => !wanted || erpOf(id)?.relationshipStatus === wanted;
  const isActive = (id: string) => erpOf(id)?.relationshipStatus === "Active contract";
  // Current suppliers first: they are the ones Sarah has to act on.
  const flagged = stats.flagged
    .filter((f) => hasRelationship(f.supplierId, riskRelationship) && (!flagFilter || f.flags.includes(flagFilter)))
    .sort((x, y) => Number(isActive(y.supplierId)) - Number(isActive(x.supplierId)));
  // Alerts of the risk-monitoring partner per supplier, most severe first, then newest (merged into the risk table, 19 Nov 2026).
  const SEVERITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const alertsOf = (id: string): RiskAlert[] =>
    (partner?.alerts ?? [])
      .filter((a) => a.supplierId === id)
      .sort((x, y) => SEVERITY_ORDER[x.severity]! - SEVERITY_ORDER[y.severity]! || y.date.localeCompare(x.date));
  const showRisk = (flag: string) => {
    setRiskRelationship("Active contract");
    setFlagFilter(flag);
  };
  const openPlain = onOpenSupplier ? (id: string) => onOpenSupplier(id) : undefined;
  const relationshipSelect = (value: string | null, onChange: (v: string | null) => void) => (
    <Select
      size="small"
      allowClear
      aria-label="Filter by relationship"
      placeholder="All relationships"
      value={value}
      onChange={(v) => onChange(v ?? null)}
      style={{ width: 170 }}
      options={relationships.map((r) => ({ value: r, label: relationshipLabel(r) }))}
    />
  );
  const lv = stats.dataLevels;

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={
          <>
            CO₂ and risks{" "}
            <InfoTip
              label="what matters most on this page"
              title="The state today: suppliers with missing or outdated data (“Supplier data”), suppliers with risks, and current suppliers against their category. Purchased CO₂ over time and against the target path is on Results. Every term is explained in the Glossary (? menu)."
            />
          </>
        }
        subtitle="Which suppliers lack sustainability data, which carry risks, and where a switch would cut the most CO₂: the state today."
        source={`Sources: client ERP, rating partner, PCF exchange · active suppliers = active contract (${stats.activeSuppliers})`}
      />

      {/* One tile above each list it filters, both the same height (20 Nov 2026). */}
      <div className="sus-grid sus-grid-stretch">
        <Card className="dash-card" size="small">
          <div className="kpi-label"><TeamOutlined /> Suppliers with sufficient sustainability data, today</div>
          <div className={`kpi-value ${toneOf((100 * lv.sufficient) / stats.allSuppliers, 80, 50)}`}>
            {lv.sufficient} of {stats.allSuppliers}
          </div>
          <div className="kpi-sub">
            <button type="button" className="link-button" onClick={() => setDataView("partial")}>
              {lv.partial} partly
            </button>{" "}
            ·{" "}
            <button type="button" className="link-button" onClick={() => setDataView("insufficient")}>
              {lv.insufficient} insufficient
            </button>
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <div className="kpi-label"><AuditOutlined /> Risks among current suppliers, today</div>
          {/* A click filters the risk table below to current suppliers with this flag (19 Nov 2026). */}
          <button
            type="button"
            className={`kpi-value kpi-link ${riskLists.lksgHigh.length ? "kpi-bad" : "kpi-good"}`}
            onClick={() => showRisk("LkSG risk High")}
          >
            {riskLists.lksgHigh.length ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />} {riskLists.lksgHigh.length} high LkSG risk
          </button>
          <div className="kpi-sub">
            <button type="button" className="link-button" onClick={() => showRisk("Controversy reported")}>
              {riskLists.controversies.length} controversies
            </button>{" "}
            ·{" "}
            <button type="button" className="link-button" onClick={() => showRisk("Proven violation")}>
              {riskLists.violations.length} proven violations
            </button>
            <br />
            <Tooltip title="Share of current suppliers with an emissions reduction target validated by the Science Based Targets initiative (SBTi), and with a sustainability report. Higher is better.">
              <span tabIndex={0}>
                SBTi target {stats.risk.sbtiPercent === null ? "—" : `${formatNumber(stats.risk.sbtiPercent, 0)} %`} · report{" "}
                {stats.risk.reportPercent === null ? "—" : `${formatNumber(stats.risk.reportPercent, 0)} %`} <InfoCircleOutlined />
              </span>
            </Tooltip>
          </div>
        </Card>
      </div>

      {/* Sarah's two to-do lists side by side on the first screen (decision 19 Nov 2026). */}
      <div className="sus-grid sus-grid-stretch">
        <DataRequestsCard
          erp={data.erp}
          dataQuality={stats.dataQuality}
          dataGaps={stats.dataGaps}
          name={name}
          onOpenSupplier={openPlain}
          keep={(id) => hasRelationship(id, dataRelationship)}
          relationshipFilter={relationshipSelect(dataRelationship, setDataRelationship)}
          onShowAll={onShowSuppliers ? (level) => onShowSuppliers({ data: level, relationship: dataRelationship }) : undefined}
          view={dataView}
          onViewChange={setDataView}
          periodLabel={stats.period.label}
        />

        <Card
          className="dash-card"
          size="small"
          title={`Risks and alerts, today (${flagged.length} flagged)`}
          extra={
            <Flex gap={8} wrap>
              {relationshipSelect(riskRelationship, setRiskRelationship)}
              <Select
                size="small"
                allowClear
                aria-label="Filter by flag"
                placeholder="All flags"
                value={flagFilter}
                onChange={setFlagFilter}
                style={{ width: 150 }}
                options={FLAG_NAMES.map((f) => ({ value: f, label: f }))}
              />
            </Flex>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Table
            size="small"
            pagination={false}
            rowKey="supplierId"
            dataSource={flagged}
            className="table-top"
            locale={{ emptyText: "No supplier with these flags." }}
            scroll={{ y: 220, x: 640 }}
            columns={[
              {
                title: "Supplier",
                key: "s",
                width: 160,
                render: (_, f) => (
                  <Flex vertical align="start">
                    <SupplierNameLink supplierId={f.supplierId} name={name(f.supplierId)} onOpen={openPlain} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {relationshipLabel(erpOf(f.supplierId)?.relationshipStatus)}
                    </Typography.Text>
                  </Flex>
                ),
              },
              {
                title: "Flags",
                key: "f",
                width: 200,
                // Next step per flag under the tags (19 Nov 2026): SA8000 audit for LkSG High, a statement for a
                // controversy. A proven violation gets no button: the rule already excludes the supplier.
                render: (_, f) => {
                  const { excluded, items } = riskRequest(f.flags, ratingOf(f.supplierId), erpOf(f.supplierId)?.country ?? null);
                  return (
                    <Flex vertical gap={6} align="start">
                      <FlagTags flags={f.flags} />
                      {items.length ? (
                        <Tooltip title={items.join(" · ")}>
                          <Button size="small" icon={<MailOutlined />} href={requestMailto(riskRequestText(name(f.supplierId), items))}>
                            {items.length === 1 ? (f.flags.includes("LkSG risk High") ? "Request audit" : "Request statement") : `Request (${items.length})`}
                          </Button>
                        </Tooltip>
                      ) : excluded ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{excluded}</Typography.Text>
                      ) : null}
                    </Flex>
                  );
                },
              },
              {
                title: `Main alert · ${RISK_MONITORING.label}`,
                key: "a",
                render: (_, f) => {
                  const list = alertsOf(f.supplierId);
                  const main = list[0];
                  if (!main) return <Typography.Text type="secondary">No alert</Typography.Text>;
                  return (
                    <Flex gap={6} align="start">
                      <RiskLevelTag level={main.severity} />
                      <span style={{ fontSize: 13 }}>
                        {main.title}
                        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                          {formatDay(main.date)}
                          {list.length > 1 && ` · ${list.length - 1} more in the supplier panel`}
                        </Typography.Text>
                      </span>
                    </Flex>
                  );
                },
              },
            ]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", padding: "6px 12px 10px" }}>
            Excluded: proven violation, LkSG High without SA8000, child or forced labour; all other flags are warnings
            {onShowSuppliers && (
              <>
                {" · "}
                <Button
                  type="link"
                  size="small"
                  className="inline-link"
                  style={{ fontSize: "inherit" }}
                  onClick={() => onShowSuppliers({ flag: flagFilter ?? ANY_FLAG, relationship: riskRelationship })}
                >
                  Show all {flagFilter ? `“${flagFilter}”` : "flagged"} in Suppliers
                </Button>
              </>
            )}
          </Typography.Text>
        </Card>
      </div>

      {partner && (() => {
        const base = supplierBaseStats(data.erp, partner.performance, partner.emissions);
        const candidates = base ? [...base.points].filter((p) => p.quadrant === "Switch candidate").sort((a, b) => b.co2Tonnes - a.co2Tonnes) : [];
        return (
          // Full width since the target path moved to Results (20 Nov 2026).
          <>
            {base && (
              <Card
                className="dash-card"
                size="small"
                title={
                  <span>
                    Current suppliers vs their category, last 12 months{" "}
                    <Tooltip title="Bubble = CO₂ bought: spend × the supplier's CO₂ per € (rating partner). Benchmark = average of all suppliers in the category. Switch candidates: high spend and more CO₂ per € than the category. Click a bubble to open the supplier.">
                      <InfoCircleOutlined aria-label="How this chart works" style={{ color: BRAND.textSecondary }} />
                    </Tooltip>
                  </span>
                }
              >
                <SupplierBaseMap
                  points={base.points}
                  medianSpendEur={base.medianSpendEur}
                  name={name}
                  width={1360}
                  height={340}
                  onOpen={
                    onOpenSupplier
                      ? (id) => {
                          const point = base.points.find((p) => p.supplierId === id);
                          onOpenSupplier(id, point ? <SupplierBaseFacts point={point} /> : undefined);
                        }
                      : undefined
                  }
                />
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  {base.pareto.suppliers} of {base.points.length} suppliers = {formatNumber(base.pareto.spendSharePercent, 0)} % of spend and{" "}
                  {formatNumber(base.pareto.co2SharePercent, 0)} % of the CO₂.{" "}
                  {candidates.length ? (
                    <>
                      Switch candidates:{" "}
                      {candidates.map((c, i) => (
                        <span key={c.supplierId}>
                          {i > 0 && ", "}
                          <SupplierNameLink supplierId={c.supplierId} name={name(c.supplierId)} onOpen={openPlain} /> (+{formatNumber(c.versusAveragePercent, 0)} %)
                        </span>
                      ))}
                      .
                    </>
                  ) : (
                    "No supplier with high spend is above its category average."
                  )}
                </Typography.Text>
              </Card>
            )}
          </>
        );
      })()}


    </Flex>
  );
}
