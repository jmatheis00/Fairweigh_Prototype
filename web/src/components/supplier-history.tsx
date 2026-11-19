"use client";

import { WarningOutlined } from "@ant-design/icons";
import { Descriptions, Flex, Table, Tag, Typography } from "antd";
import { formatDay, type SupplierPerformanceMonth } from "@scc/shared";
import { formatMonth, formatNumber, formatEur } from "@/lib/labels";
import { usePartnerData } from "@/lib/partner-data";
import { PdfLink } from "./pdf-link";
import { RiskLevelTag } from "./risk-level-tag";
import { BRAND } from "@/lib/theme";

const TEAL = BRAND.secondary;
const GRID = BRAND.border;
const DEMO_DATE = "2026-11-06";

/** A small line chart with its first and last month and min/max, so it reads without colour. */
function MiniLine({ values, months, unit, decimals, label }: { values: number[]; months: string[]; unit: string; decimals: number; label: string }) {
  if (values.length < 2) return null;
  const W = 320;
  const H = 70;
  const pad = { l: 34, r: 6, t: 6, b: 16 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (values.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label}: from ${formatNumber(values[0]!, decimals)}${unit} to ${formatNumber(values.at(-1)!, decimals)}${unit}`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(max)} y2={y(max)} stroke={GRID} />
      <line x1={pad.l} x2={W - pad.r} y1={y(min)} y2={y(min)} stroke={GRID} />
      <text x={pad.l - 4} y={y(max) + 3} fontSize="9" textAnchor="end" fill={BRAND.textSecondary}>{formatNumber(max, decimals)}{unit}</text>
      <text x={pad.l - 4} y={y(min) + 3} fontSize="9" textAnchor="end" fill={BRAND.textSecondary}>{formatNumber(min, decimals)}{unit}</text>
      <polyline points={points} fill="none" stroke={TEAL} strokeWidth="1.6" />
      <circle cx={x(values.length - 1)} cy={y(values.at(-1)!)} r="2.5" fill={TEAL} />
      <text x={pad.l} y={H - 3} fontSize="9" fill={BRAND.textSecondary}>{formatMonth(`${months[0]}-01`)}</text>
      <text x={W - pad.r} y={H - 3} fontSize="9" textAnchor="end" fill={BRAND.textSecondary}>{formatMonth(`${months.at(-1)}-01`)}</text>
    </svg>
  );
}

function sumOf(rows: SupplierPerformanceMonth[], key: keyof Omit<SupplierPerformanceMonth, "supplierId" | "month">): number {
  return rows.reduce((a, r) => a + r[key], 0);
}

/** "+2.0 points better than the 12 months before" in words, never colour alone. */
function trendText(now: number, before: number, unit: string, higherIsBetter: boolean): string {
  const diff = Math.round((now - before) * 10) / 10;
  if (diff === 0) return "same as the 12 months before";
  const better = higherIsBetter ? diff > 0 : diff < 0;
  return `${diff > 0 ? "+" : "-"}${formatNumber(Math.abs(diff), 1)}${unit} vs the 12 months before (${better ? "better" : "worse"})`;
}

/**
 * Everything the connected systems know about a supplier beyond the current offer:
 * 24 months of deliveries and complaints (client ERP), rating history, certificates and
 * company emissions (rating partner), alerts (risk monitoring).
 */
export function SupplierHistory({ supplierId }: { supplierId: string }) {
  const { data, error } = usePartnerData();
  if (error) return <Typography.Text type="danger">History could not be loaded: {error}</Typography.Text>;
  if (!data) return null;

  const months = data.performance.filter((p) => p.supplierId === supplierId);
  const last = months.slice(-12);
  const before = months.slice(-24, -12);
  const rate = (rows: SupplierPerformanceMonth[], key: "onTimeDeliveries" | "qualityNotifications") =>
    sumOf(rows, "deliveries") > 0 ? (100 * sumOf(rows, key)) / sumOf(rows, "deliveries") : 0;
  const history = data.ratingHistory.filter((h) => h.supplierId === supplierId);
  const certs = data.certificates.filter((c) => c.supplierId === supplierId);
  const emissions = data.emissions.find((e) => e.supplierId === supplierId);
  const alerts = data.alerts.filter((a) => a.supplierId === supplierId);

  return (
    <Flex vertical gap={16}>
      {months.length > 0 ? (
        <div>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Deliveries and quality · Client ERP
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Last 12 months: {formatNumber(sumOf(last, "deliveries"), 0)} deliveries, {formatNumber(rate(last, "onTimeDeliveries"), 1)} % on time,{" "}
            {formatNumber(rate(last, "qualityNotifications"), 1)} % with a complaint.
          </Typography.Text>
          <Flex gap={16} wrap style={{ marginTop: 6 }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <Typography.Text style={{ fontSize: 12 }}>
                On-time delivery per month · {before.length === 12 ? trendText(rate(last, "onTimeDeliveries"), rate(before, "onTimeDeliveries"), " pts", true) : ""}
              </Typography.Text>
              <MiniLine
                label="On-time delivery per month"
                values={months.map((m) => (m.deliveries ? (100 * m.onTimeDeliveries) / m.deliveries : 0))}
                months={months.map((m) => m.month)}
                unit=" %"
                decimals={0}
              />
            </div>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <Typography.Text style={{ fontSize: 12 }}>
                Complaint rate per month · {before.length === 12 ? trendText(rate(last, "qualityNotifications"), rate(before, "qualityNotifications"), " pts", false) : ""}
              </Typography.Text>
              <MiniLine
                label="Complaint rate per month"
                values={months.map((m) => (m.deliveries ? (100 * m.qualityNotifications) / m.deliveries : 0))}
                months={months.map((m) => m.month)}
                unit=" %"
                decimals={1}
              />
            </div>
          </Flex>
          {sumOf(last, "spendEur") > 0 && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Spend last 12 months: {formatEur(sumOf(last, "spendEur"), 0)}
              {before.length === 12 && sumOf(before, "spendEur") > 0
                ? ` (12 months before: ${formatEur(sumOf(before, "spendEur"), 0)})`
                : ""}
            </Typography.Text>
          )}
        </div>
      ) : (
        <Typography.Text type="secondary">No deliveries in the client ERP yet.</Typography.Text>
      )}

      <Descriptions
        size="small"
        column={1}
        bordered
        title="Sustainability · Rating partner"
        items={[
          {
            label: "Rating history",
            children: history.length ? history.map((h) => `${h.year}: ${h.score}`).join(" → ") : "Not rated",
          },
          { label: "Scope 1+2 emissions", children: emissions?.scope12Tonnes != null ? `${formatNumber(emissions.scope12Tonnes, 0)} t CO₂e (${emissions.reportingYear})` : "No data" },
          { label: "CO₂ intensity", children: emissions?.intensityKgPerEur != null ? `${formatNumber(emissions.intensityKgPerEur, 3)} kg CO₂e per € revenue` : "No data" },
          { label: "Renewable energy", children: emissions?.renewableEnergyPercent != null ? `${formatNumber(emissions.renewableEnergyPercent, 0)} %` : "No data" },
          { label: "Data completeness", children: emissions?.dataCompletenessPercent != null ? `${formatNumber(emissions.dataCompletenessPercent, 0)} % of requested data` : "No data" },
          { label: "Transport distance", children: emissions?.transportDistanceKm != null ? `${formatNumber(emissions.transportDistanceKm, 0)} km to our plant` : "No data" },
        ]}
      />

      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Certificates ({certs.length})
        </Typography.Title>
        {certs.length === 0 ? (
          <Typography.Text type="secondary">None listed.</Typography.Text>
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="certificateId"
            dataSource={certs}
            columns={[
              { title: "Standard", dataIndex: "standard" },
              {
                title: "Valid until",
                key: "until",
                render: (_, c) => {
                  const days = Math.round((Date.parse(c.validUntil) - Date.parse(DEMO_DATE)) / 86_400_000);
                  return (
                    <span>
                      {formatDay(c.validUntil)}
                      {days <= 120 && (
                        <Tag icon={<WarningOutlined />} style={{ marginInlineStart: 6 }}>
                          expires in {days} days
                        </Tag>
                      )}
                    </span>
                  );
                },
              },
              { title: "", key: "pdf", align: "right", render: (_, c) => <PdfLink documentId={c.documentId} label="PDF" /> },
            ]}
          />
        )}
      </div>

      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Alerts · Risk monitoring ({alerts.length})
        </Typography.Title>
        {alerts.length === 0 ? (
          <Typography.Text type="secondary">No alerts.</Typography.Text>
        ) : (
          <Flex vertical gap={6}>
            {alerts.map((a) => (
              // Tag in its own column, the text aligned next to it; category and date on their own line (19 Nov 2026).
              <Flex key={a.alertId} className="alert-row" gap={8} align="flex-start">
                <RiskLevelTag level={a.severity} style={{ marginInlineEnd: 0, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <strong>{a.title}</strong>
                  <div style={{ fontSize: 12, color: BRAND.textSecondary }}>
                    {a.category} · {formatDay(a.date)}
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.textSecondary, marginTop: 2 }}>{a.detail}</div>
                </div>
              </Flex>
            ))}
          </Flex>
        )}
      </div>
    </Flex>
  );
}
