"use client";

import { AuditOutlined, CheckCircleOutlined, CloseCircleOutlined, CloudOutlined, ExclamationCircleOutlined, InfoCircleOutlined, MinusCircleOutlined, SafetyCertificateOutlined, StopOutlined, TeamOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Card, Flex, Popover, Select, Table, Tag, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  formatDay,
  co2TargetPath,
  periodOptions,
  supplierBaseStats,
  sustainabilityStats,
  type DataLevel,
  type DemoSettings,
  type DocumentRecord,
  type ErpRecord,
  type PcfRecord,
  type PurchaseOrderRecord,
  type RatingRecord,
} from "@scc/shared";
import { api } from "@/lib/api";
import { formatNumber, shortPartName } from "@/lib/labels";
import { shortName } from "@/lib/names";
import { PART_COLOR } from "./co2-month-chart";
import { PcfBadgeTag } from "./pcf-badge-tag";
import { InfoTip } from "./info-tip";
import { PageHeader } from "./page-header";
import { RiskAlertsCard } from "./risk-alerts-card";
import { DataRequestsCard } from "./data-requests-card";
import { Co2TargetChart, SupplierBaseMap } from "./analytics-charts";
import { usePartnerData } from "@/lib/partner-data";
import { FilterBar, defaultFilter, type StatsFilter } from "./filter-bar";
import { Co2Source, ExplainedTitle, Relationship, relationshipLabel } from "@/lib/supplier-labels";
import { BRAND } from "@/lib/theme";

const TEAL = BRAND.secondary;

interface Data {
  orders: PurchaseOrderRecord[];
  erp: ErpRecord[];
  ratings: RatingRecord[];
  pcf: PcfRecord[];
  fines: DocumentRecord[];
}

/** Data level as icon plus word (never colour alone). */
function DataLevelLabel({ level }: { level: DataLevel }) {
  if (level === "sufficient") return <span className="tone-good"><CheckCircleOutlined /> Sufficient</span>;
  if (level === "partial") return <span className="tone-warn"><MinusCircleOutlined /> Partly</span>;
  return <span className="tone-bad"><CloseCircleOutlined /> Insufficient</span>;
}

const FLAG_ICON: Record<string, React.ReactNode> = {
  "Proven violation": <StopOutlined />,
  "LkSG risk High": <ExclamationCircleOutlined />,
  "Controversy reported": <WarningOutlined />,
};

/** Status class for a share: at least `good` % is good, at least `warn` % needs attention, below is bad. */
function toneOf(value: number | null, good: number, warn: number): string {
  if (value === null) return "";
  return value >= good ? "kpi-good" : value >= warn ? "kpi-warn" : "kpi-bad";
}

/** Click a count to see which suppliers it is about. */
function SupplierListPopover({ title, ids, name, children }: { title: string; ids: string[]; name: (id: string) => string; children: React.ReactNode }) {
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      title={`${title} (${ids.length})`}
      content={
        ids.length ? (
          <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 240, overflow: "auto" }}>
            {ids.map((id) => (
              <li key={id}>
                {name(id)} <Typography.Text type="secondary">{id}</Typography.Text>
              </li>
            ))}
          </ul>
        ) : (
          "None"
        )
      }
    >
      {children}
    </Popover>
  );
}

/** Sarah's view: Scope 3 hotspots, data quality, data requests, risk and rules. */
export function SustainabilityPage({ settings }: { settings: DemoSettings }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filters: period and product for the whole page (top bar); relationship and flag sit on the supplier
  // lists they filter (feedback 17 Nov 2026: in the top bar the relationship filter seemed to do nothing).
  const [filter, setFilter] = useState<StatsFilter | null>(null);
  const [dataRelationship, setDataRelationship] = useState<string | null>(null);
  const [riskRelationship, setRiskRelationship] = useState<string | null>(null);
  const [flagFilter, setFlagFilter] = useState<string | null>(null);
  const partner = usePartnerData().data;

  useEffect(() => {
    Promise.all([api.purchaseOrders(), api.erpList(), api.ratingList(), api.pcfList(), api.fineNotices()])
      .then(([orders, erp, ratings, pcf, fines]) => setData({ orders, erp, ratings, pcf, fines }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const options = useMemo(() => (data ? periodOptions(data.orders.map((o) => o.orderDate)) : null), [data]);
  const active = filter ?? (options ? defaultFilter(options) : null);
  const stats = useMemo(
    () =>
      data && active
        ? sustainabilityStats({
            orders: active.partId ? data.orders.filter((o) => o.partId === active.partId) : data.orders,
            period: active.period,
            erp: data.erp,
            ratings: data.ratings,
            pcf: data.pcf,
            documents: data.fines,
            today: dayjs().format("YYYY-MM-DD"),
            co2MaxAgeDays: settings.co2MaxAgeDays,
          })
        : null,
    [data, active, settings.co2MaxAgeDays],
  );

  if (error) return <Alert type="error" showIcon title={`Sustainability data not available: ${error}`} />;
  if (!data || !stats || !options || !active) return null;

  const erpOf = (id: string) => data.erp.find((e) => e.supplierId === id);
  const name = (id: string) => shortName(erpOf(id)?.supplierName ?? id);
  const part = (id: string) => (settings.catalog.find((p) => p.partId === id)?.partName ?? id).split(",")[0]!;
  const outdated = stats.dataQuality.filter((d) => d.outdated);
  // Who is behind the risk counts (active suppliers), so the tile can list them on click.
  const activeIds = new Set(data.erp.filter((e) => e.relationshipStatus === "Active contract").map((e) => e.supplierId));
  const activeRatings = data.ratings.filter((r) => activeIds.has(r.supplierId));
  const riskLists = {
    lksgHigh: activeRatings.filter((r) => r.lksgCountryRisk === "High").map((r) => r.supplierId),
    controversies: activeRatings.filter((r) => r.controversies && r.controversies !== "None known").map((r) => r.supplierId),
    violations: [...new Set(data.fines.map((d) => d.supplierId))].filter((id) => activeIds.has(id)),
  };
  const products = settings.catalog
    .filter((p) => data.orders.some((o) => o.partId === p.partId))
    .map((p) => ({ partId: p.partId, label: shortPartName(p.partId, p.partName), name: p.partName }));
  const relationships = [...new Set(data.erp.map((e) => e.relationshipStatus).filter(Boolean))].sort();
  const hasRelationship = (id: string, wanted: string | null) => !wanted || erpOf(id)?.relationshipStatus === wanted;
  const dataGaps = stats.dataGaps.filter((g) => hasRelationship(g.supplierId, dataRelationship));
  const flagged = stats.flagged.filter((f) => hasRelationship(f.supplierId, riskRelationship) && (!flagFilter || f.flags.includes(flagFilter)));
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
  const trend =
    stats.previous && stats.previous.co2Tonnes > 0
      ? Math.round(((stats.co2Tonnes - stats.previous.co2Tonnes) / stats.previous.co2Tonnes) * 1000) / 10
      : null;

  const maxHotspot = Math.max(...stats.hotspots.map((h) => h.co2Tonnes), 1);
  const lv = stats.dataLevels;
  const levelParts = [
    { key: "Sufficient", n: lv.sufficient, color: TEAL },
    { key: "Partly", n: lv.partial, color: BRAND.textTertiary },
    { key: "Insufficient", n: lv.insufficient, color: BRAND.borderStrong },
  ].filter((p) => p.n > 0);

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={
          <>
            CO₂ and risks, {stats.period.label}{" "}
            <InfoTip
              label="what matters most on this page"
              title="Most important for decisions: purchased CO₂ against the target path, suppliers whose CO₂ data is estimated or outdated (“Data to request”), and suppliers with LkSG risk High. Every term is explained in the Glossary (? menu)."
            />
          </>
        }
        subtitle="Where your purchased CO₂ comes from (Scope 3), how good the CO₂ data is, and which suppliers carry risks."
        source={`Sources: client ERP, rating partner, PCF exchange · active suppliers = active contract (${stats.activeSuppliers})`}
      />
      <FilterBar
        options={options}
        value={active}
        onChange={setFilter}
        products={products}
      />

      <div className="kpi-grid kpi-grid-4">
        <Card className="dash-card" size="small">
          <div className="kpi-label"><CloudOutlined /> Purchased CO₂e (Scope 3, category 1)</div>
          <div className="kpi-value">{formatNumber(stats.co2Tonnes, 1)} t</div>
          <div className="kpi-sub">
            {trend !== null && stats.previous && (
              <span className={trend <= 0 ? "delta delta-better" : "delta delta-worse"}>
                {trend <= 0 ? "↓" : "↑"} {formatNumber(Math.abs(trend), 1)} % {trend <= 0 ? "lower" : "higher"} vs {stats.previous.period.label}
                <br />
              </span>
            )}
            {stats.hotspots[0]
              ? `Largest hotspot: ${name(stats.hotspots[0].supplierId)}, ${formatNumber(stats.hotspots[0].sharePercent, 0)} %`
              : "No purchases in this period"}
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <div className="kpi-label"><SafetyCertificateOutlined /> Spend with supplier-specific CO₂ data</div>
          <div className={`kpi-value ${toneOf(stats.supplierSpecificSpendPercent, 80, 50)}`}>
            {stats.supplierSpecificSpendPercent === null ? "—" : `${formatNumber(stats.supplierSpecificSpendPercent, 0)} %`}
          </div>
          <div className="kpi-sub">
            {outdated.length > 0 ? (
              <>
                <WarningOutlined /> {outdated.length} of {stats.dataQuality.length} values older than 1 year
              </>
            ) : (
              "All values younger than 1 year"
            )}
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <div className="kpi-label"><TeamOutlined /> Suppliers with sufficient sustainability data</div>
          <div className={`kpi-value ${toneOf((100 * lv.sufficient) / stats.allSuppliers, 80, 50)}`}>
            {lv.sufficient} of {stats.allSuppliers}
          </div>
          <div className="kpi-sub">
            {lv.partial} partly · {lv.insufficient} insufficient · from the source systems
          </div>
        </Card>
        <Card className="dash-card" size="small">
          <div className="kpi-label"><AuditOutlined /> Risks among active suppliers</div>
          <SupplierListPopover title="High LkSG country risk" ids={riskLists.lksgHigh} name={name}>
            <button type="button" className={`kpi-value kpi-link ${riskLists.lksgHigh.length ? "kpi-bad" : "kpi-good"}`}>
              {riskLists.lksgHigh.length ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />} {riskLists.lksgHigh.length} high LkSG risk
            </button>
          </SupplierListPopover>
          <div className="kpi-sub">
            <SupplierListPopover title="Controversies reported" ids={riskLists.controversies} name={name}>
              <button type="button" className="link-button">{riskLists.controversies.length} controversies</button>
            </SupplierListPopover>{" "}
            ·{" "}
            <SupplierListPopover title="Proven violations" ids={riskLists.violations} name={name}>
              <button type="button" className="link-button">{riskLists.violations.length} proven violations</button>
            </SupplierListPopover>
            <br />
            <Tooltip title="Share of active suppliers with an emissions reduction target validated by the Science Based Targets initiative (SBTi). Higher is better.">
              <span tabIndex={0}>
                Climate target (SBTi): {stats.risk.sbtiPercent === null ? "—" : `${formatNumber(stats.risk.sbtiPercent, 0)} % of suppliers`}{" "}
                <InfoCircleOutlined />
              </span>
            </Tooltip>
          </div>
        </Card>
      </div>

      <DataRequestsCard erp={data.erp} dataQuality={stats.dataQuality} dataGaps={stats.dataGaps} flagged={stats.flagged} name={name} />

      {partner && (() => {
        const base = supplierBaseStats(data.erp, partner.performance, partner.emissions);
        const trend = co2TargetPath(active.partId ? data.orders.filter((o) => o.partId === active.partId) : data.orders);
        const lastQuarter = trend.slice(-3);
        const gap = lastQuarter.length
          ? (lastQuarter.reduce((a, p) => a + p.actualTonnes, 0) / lastQuarter.reduce((a, p) => a + p.targetTonnes, 0) - 1) * 100
          : null;
        const candidates = base ? [...base.points].filter((p) => p.quadrant === "Switch candidate").sort((a, b) => b.co2Tonnes - a.co2Tonnes) : [];
        return (
          <Flex vertical gap={12}>
            {base && (
              <Card
                className="dash-card"
                size="small"
                title={
                  <span>
                    Current suppliers against their category{" "}
                    <Tooltip title="Bubble = CO₂ bought: spend × the supplier's CO₂ per € (rating partner). Benchmark = average of all suppliers in the category. Last 12 months. Switch candidates: high spend and more CO₂ per € than the category.">
                      <InfoCircleOutlined aria-label="How this chart works" style={{ color: BRAND.textSecondary }} />
                    </Tooltip>
                  </span>
                }
                extra={
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {base.pareto.suppliers} of {base.points.length} suppliers = {formatNumber(base.pareto.spendSharePercent, 0)} % of spend and{" "}
                    {formatNumber(base.pareto.co2SharePercent, 0)} % of the CO₂
                  </Typography.Text>
                }
              >
                <SupplierBaseMap points={base.points} medianSpendEur={base.medianSpendEur} name={name} />
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  {candidates.length
                    ? `Switch candidates: ${candidates.map((c) => `${name(c.supplierId)} (+${formatNumber(c.versusAveragePercent, 0)} %)`).join(", ")}. `
                    : "No supplier with high spend is above its category average."}
                </Typography.Text>
              </Card>
            )}
            <Card
              className="dash-card"
              size="small"
              title={
                <span>
                  Purchased CO₂ per month against the target path{" "}
                  <Tooltip title="t CO₂e per month from purchase orders × CO₂ per piece. Dashed: the 2025 average reduced by 4.2 % per year (SBTi 1.5 °C cross-sector rate).">
                    <InfoCircleOutlined aria-label="How this chart works" style={{ color: BRAND.textSecondary }} />
                  </Tooltip>
                </span>
              }
              extra={
                gap !== null ? (
                  <Typography.Text style={{ fontSize: 12 }}>
                    Last quarter: {formatNumber(Math.abs(gap), 0)} % {gap <= 0 ? "below" : "above"} the path
                  </Typography.Text>
                ) : null
              }
            >
              <Co2TargetChart points={trend} />
              {active.partId && (
                <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                  Filtered to one product.
                </Typography.Text>
              )}
            </Card>
          </Flex>
        );
      })()}

      <div className="sus-grid">
        <Card className="dash-card" size="small" title={`CO₂ hotspots: purchased CO₂e by supplier, ${stats.period.label}`}>
          <Flex vertical gap={10} role="list">
            {stats.hotspots.map((h) => (
              <div key={`${h.supplierId}-${h.partId}`} role="listitem">
                <Flex justify="space-between" style={{ fontSize: 13 }}>
                  <span>
                    <strong>{name(h.supplierId)}</strong> · {part(h.partId)}
                  </span>
                  <span>
                    {formatNumber(h.co2Tonnes, 1)} t · {formatNumber(h.sharePercent, 0)} %
                  </span>
                </Flex>
                <div className="hbar-track" aria-hidden="true">
                  <div className="hbar-fill" style={{ width: `${(h.co2Tonnes / maxHotspot) * 100}%`, background: PART_COLOR[h.partId] ?? TEAL }} />
                </div>
              </div>
            ))}
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 10 }}>
            Purchase orders × CO₂ per piece from each supplier&apos;s PCF record. Bar colour = product, as on the overview.
          </Typography.Text>
        </Card>

        <Card className="dash-card" size="small" title="Data quality behind these CO₂ values" styles={{ body: { padding: 0 } }}>
          <Table
            size="small"
            pagination={false}
            scroll={{ x: 560 }}
            rowKey="pcfRecordId"
            dataSource={stats.dataQuality}
            columns={[
              { title: "Supplier", key: "s", render: (_, d) => name(d.supplierId) },
              { title: "Product", key: "p", render: (_, d) => part(d.partId) },
              { title: "Value", key: "b", width: 110, render: (_, d) => <PcfBadgeTag badge={d.badge} /> },
              { title: "Source", key: "src", render: (_, d) => <Co2Source source={d.dataSource} /> },
              {
                title: "As of",
                key: "age",
                width: 150,
                render: (_, d) =>
                  d.outdated ? (
                    <Tooltip title="Older than 1 year: ask the supplier for an update">
                      <span>
                        <WarningOutlined /> {formatDay(d.referenceDate)}
                      </span>
                    </Tooltip>
                  ) : (
                    formatDay(d.referenceDate)
                  ),
              },
            ]}
          />
        </Card>

        <Card
          className="dash-card"
          size="small"
          title={`Suppliers with data gaps (${dataRelationship ? `${relationshipLabel(dataRelationship)}: ${dataGaps.length}` : `${dataGaps.length} of ${stats.allSuppliers}`})`}
          extra={relationshipSelect(dataRelationship, setDataRelationship)}
          styles={{ body: { padding: 0 } }}
        >
          <div style={{ padding: "10px 12px 6px" }}>
            <div className="stack-track" role="img" aria-label={levelParts.map((p) => `${p.key} ${p.n}`).join(", ")}>
              {levelParts.map((p) => (
                <div key={p.key} style={{ flex: p.n, background: p.color }} />
              ))}
            </div>
            <Flex gap={14} wrap style={{ fontSize: 12, marginTop: 6 }}>
              {levelParts.map((p) => (
                <Flex key={p.key} align="center" gap={6}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 2, background: p.color, border: `1px solid ${BRAND.borderStrong}` }} />
                  {p.key}: {p.n}
                </Flex>
              ))}
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
              Sufficient = CO₂ data from the supplier (report, self-assessment or PCF declaration) and a sustainability rating. Industry
              averages and web searches do not count.
            </Typography.Text>
          </div>
          <Table
            size="small"
            pagination={false}
            rowKey="supplierId"
            dataSource={dataGaps}
            locale={{ emptyText: `No ${dataRelationship ? relationshipLabel(dataRelationship).toLowerCase() : "supplier"} with data gaps: all have sufficient data.` }}
            scroll={{ y: 190, x: 600 }}
            columns={[
              { title: "Supplier", key: "s", render: (_, r) => name(r.supplierId) },
              { title: <ExplainedTitle title="Relationship" kind="relationship" />, key: "rel", render: (_, r) => <Relationship status={erpOf(r.supplierId)?.relationshipStatus} /> },
              { title: "Data", key: "lv", width: 120, render: (_, r) => <DataLevelLabel level={r.level} /> },
              { title: "Missing", key: "m", render: (_, r) => r.missing.join(", ") },
            ]}
          />
        </Card>

        <Card
          className="dash-card"
          size="small"
          title={`Risk and rules (${riskRelationship ? `${relationshipLabel(riskRelationship)}: ${flagged.length} flagged` : `${flagged.length} of ${data.ratings.length} suppliers flagged`})`}
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
              style={{ width: 170 }}
              options={Object.keys(FLAG_ICON).map((f) => ({ value: f, label: f }))}
              />
            </Flex>
          }
          styles={{ body: { padding: 0 } }}
        >
          <Flex gap={16} wrap style={{ padding: "10px 12px 6px", fontSize: 13 }}>
            <span>
              Active suppliers with SBTi target: <strong>{stats.risk.sbtiPercent === null ? "—" : `${formatNumber(stats.risk.sbtiPercent, 0)} %`}</strong>
            </span>
            <span>
              with sustainability report: <strong>{stats.risk.reportPercent === null ? "—" : `${formatNumber(stats.risk.reportPercent, 0)} %`}</strong>
            </span>
          </Flex>
          <Table
            size="small"
            pagination={false}
            rowKey="supplierId"
            dataSource={flagged}
            locale={{ emptyText: "No supplier with these flags." }}
            scroll={{ y: 190, x: 520 }}
            columns={[
              { title: "Supplier", key: "s", render: (_, f) => name(f.supplierId) },
              { title: <ExplainedTitle title="Relationship" kind="relationship" />, key: "r", width: 170, render: (_, f) => <Relationship status={erpOf(f.supplierId)?.relationshipStatus} /> },
              {
                title: "Flags",
                key: "f",
                render: (_, f) => (
                  <Flex wrap gap={4}>
                    {f.flags.map((flag) => (
                      <Tag key={flag} icon={FLAG_ICON[flag]} color={flag === "Controversy reported" ? "warning" : "error"} style={{ marginInlineEnd: 0 }}>
                        {flag}
                      </Tag>
                    ))}
                  </Flex>
                ),
              },
            ]}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", padding: "6px 12px 10px" }}>
            Excluded: proven violations, high LkSG risk without a social audit (SA8000), child or forced labour. Other risks and controversies are warnings.
          </Typography.Text>
        </Card>
      </div>

      <RiskAlertsCard supplierName={name} />
    </Flex>
  );
}
