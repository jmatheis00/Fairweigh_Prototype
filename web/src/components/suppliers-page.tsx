"use client";

import { ExclamationCircleOutlined, SearchOutlined, StarFilled, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Checkbox, Flex, Input, Select, Table, Typography } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDay, type DecisionRecord, type ErpRecord, type RatingRecord } from "@scc/shared";
import { api } from "@/lib/api";
import { formatNumber, formatEur } from "@/lib/labels";
import type { DemoUser } from "@/lib/users";
import { Co2Source, ExplainedTitle, NoValue, RELATIONSHIP_OPTIONS, Relationship, hasNoOrders, relationshipLabel } from "@/lib/supplier-labels";
import { complaintLevel, ratingLevel, type RiskLevel } from "@/lib/risk-levels";
import { RiskTag, SupplierInfoPanel } from "./supplier-info-panel";

interface Row {
  key: string;
  erp: ErpRecord;
  rating: RatingRecord | null;
}

interface Props {
  user: DemoUser;
  /** Suppliers with an offer in the current run; their cockpit profile can be opened. */
  inCurrentRun: string[];
  onOpenInCockpit: (supplierId: string) => void;
  favourites: string[];
  onToggleFavourite: (supplierId: string) => void;
  decisions: DecisionRecord[];
  partNames: Record<string, string>;
  onOpenDecision: (record: DecisionRecord) => void;
  /** Supplier to open, e.g. from a link in the Decision Log. */
  openSupplierId: string | null;
}

/** A value with its level: colour plus icon plus word, never colour alone (thresholds in the glossary). */
function Leveled({ level, children, suffix = "" }: { level: RiskLevel; children: ReactNode; suffix?: string }) {
  if (level === "low") return <span>{children}</span>;
  return (
    <span className={`level-${level}`} style={{ whiteSpace: "nowrap" }}>
      {level === "high" ? <ExclamationCircleOutlined /> : <WarningOutlined />} {children} · {level}
      {suffix}
    </span>
  );
}


const unique = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => v !== null))].sort().map((v) => ({ value: v, label: v }));

/** All suppliers from the simulated ERP and rating provider. */
export function SuppliersPage({
  user,
  inCurrentRun,
  onOpenInCockpit,
  favourites,
  onToggleFavourite,
  decisions,
  partNames,
  onOpenDecision,
  openSupplierId,
}: Props) {
  const [erp, setErp] = useState<ErpRecord[] | null>(null);
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [risk, setRisk] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(openSupplierId);
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  // Only the buyer keeps favourites; the other roles see the list read-only.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow a link from the Decision Log
    if (openSupplierId) setOpenId(openSupplierId);
  }, [openSupplierId]);

  useEffect(() => {
    Promise.all([api.erpList(), api.ratingList()])
      .then(([e, r]) => {
        setErp(e);
        setRatings(r);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const rows: Row[] = useMemo(() => {
    const byId = new Map(ratings.map((r) => [r.supplierId, r]));
    return (erp ?? []).map((e) => ({ key: e.supplierId, erp: e, rating: byId.get(e.supplierId) ?? null }));
  }, [erp, ratings]);

  const shown = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !`${r.erp.supplierName} ${r.erp.supplierId} ${r.erp.country} ${r.erp.city} ${r.erp.products} ${relationshipLabel(r.erp.relationshipStatus)}`.toLowerCase().includes(q)) return false;
    if (category && r.erp.category !== category) return false;
    if (status && r.erp.relationshipStatus !== status) return false;
    if (risk && (r.rating?.lksgCountryRisk ?? "Not rated") !== risk) return false;
    if (onlyFavourites && !favourites.includes(r.key)) return false;
    return true;
  });

  const open = rows.find((r) => r.key === openId) ?? null;

  return (
    <Card
      className="dash-card"
      size="small"
      title={`Suppliers (${shown.length} of ${rows.length})`}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          From the client ERP and the rating partner · click a row for its records
        </Typography.Text>
      }
      styles={{ body: { padding: 0 } }}
    >
      {error && <Alert type="error" showIcon title={error} />}
      <Flex gap={8} wrap style={{ padding: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search name, ID, country, product"
          aria-label="Search suppliers"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 280 }}
        />
        <Select allowClear placeholder="Category" aria-label="Filter by category" style={{ width: 220 }} value={category} onChange={setCategory} options={unique(rows.map((r) => r.erp.category))} />
        <Select allowClear placeholder="Relationship" aria-label="Filter by relationship" style={{ width: 200 }} value={status} onChange={setStatus} options={RELATIONSHIP_OPTIONS} />
        <Select
          allowClear
          placeholder="LkSG risk"
          aria-label="Filter by LkSG country risk"
          style={{ width: 140 }}
          value={risk}
          onChange={setRisk}
          options={["Low", "Medium", "High", "Not rated"].map((v) => ({ value: v, label: v }))}
        />
        {/* Every user keeps their own favourites (16 Nov 2026). */}
        <Checkbox checked={onlyFavourites} onChange={(e) => setOnlyFavourites(e.target.checked)} style={{ alignSelf: "center" }}>
          <StarFilled className="fav-star" /> Favourites only ({favourites.length})
        </Checkbox>
      </Flex>
      <Table<Row>
        size="small"
        loading={erp === null && !error}
        pagination={false}
        dataSource={shown}
        // Fits a 1280 px laptop (16 Nov 2026): country under the name, spend and contract end in one column.
        scroll={{ y: "calc(100vh - 260px)", x: user.seesCommercials ? 1218 : 1088 }}
        className="table-clickable"
        onRow={(r) => ({ onClick: () => setOpenId(r.key) })}
        rowClassName={(r) => (r.key === openId ? "cell-selected" : "")}
        columns={[
          {
            title: "Supplier",
            key: "name",
            width: 230,
            sorter: (a, b) => a.erp.supplierName.localeCompare(b.erp.supplierName),
            render: (_, r) => (
              <Flex vertical>
                <Flex align="center" gap={4}>
                {favourites.includes(r.key) && <StarFilled className="fav-star" aria-label="Favourite" />}
                <Button type="link" size="small" style={{ padding: 0, height: "auto", justifyContent: "flex-start" }} onClick={() => setOpenId(r.key)}>
                  <Typography.Text ellipsis style={{ maxWidth: 190, color: "inherit" }}>{r.erp.supplierName}</Typography.Text>
                </Button>
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {r.erp.supplierId} · {r.erp.country}
                </Typography.Text>
              </Flex>
            ),
          },
          { title: "Category", key: "category", width: 150, render: (_, r) => r.erp.category },
          { title: <ExplainedTitle title="Relationship" kind="relationship" />, key: "status", width: 140, render: (_, r) => <Relationship status={r.erp.relationshipStatus} /> },
          {
            title: "On time",
            key: "otd",
            width: 96,
            align: "right",
            sorter: (a, b) => (a.erp.onTimeDeliveryPercent ?? -1) - (b.erp.onTimeDeliveryPercent ?? -1),
            render: (_, r) =>
              r.erp.onTimeDeliveryPercent === null ? <NoValue reason={hasNoOrders(r.erp.relationshipStatus) ? "No orders" : "No data"} /> : `${formatNumber(r.erp.onTimeDeliveryPercent, 0)} %`,
          },
          {
            title: "Complaints",
            key: "compl",
            width: 130,
            align: "right",
            sorter: (a, b) => (a.erp.complaintRatePercent ?? 99) - (b.erp.complaintRatePercent ?? 99),
            render: (_, r) =>
              r.erp.complaintRatePercent === null ? (
                <NoValue reason={hasNoOrders(r.erp.relationshipStatus) ? "No orders" : "No data"} />
              ) : (
                <Leveled level={complaintLevel(r.erp.complaintRatePercent)}>{formatNumber(r.erp.complaintRatePercent, 1)} %</Leveled>
              ),
          },
          {
            title: "Rating",
            key: "score",
            width: 112,
            align: "right",
            sorter: (a, b) => (a.rating?.sustainabilityScore ?? -1) - (b.rating?.sustainabilityScore ?? -1),
            // A low rating means a high risk: "25 · high risk", so it cannot be read as a good score (review 16 Nov 2026).
            render: (_, r) =>
              r.rating?.sustainabilityScore == null ? (
                <NoValue reason="Not rated" />
              ) : (
                <Leveled level={ratingLevel(r.rating.sustainabilityScore)} suffix=" risk">{r.rating.sustainabilityScore}</Leveled>
              ),
          },
          { title: "LkSG risk", key: "risk", width: 100, render: (_, r) => <RiskTag risk={r.rating?.lksgCountryRisk ?? null} /> },
          { title: <ExplainedTitle title="Company CO₂ data" kind="co2Source" />, key: "co2src", width: 130, render: (_, r) => <Co2Source source={r.rating?.co2DataSource} /> },
          ...(user.seesCommercials
            ? [
                {
                  title: "Spend / year",
                  key: "spend",
                  width: 130,
                  align: "right" as const,
                  sorter: (a: Row, b: Row) => (a.erp.annualSpendEur ?? 0) - (b.erp.annualSpendEur ?? 0),
                  // Contract end as a second line under the spend, so the table fits a laptop screen.
                  render: (_: unknown, r: Row) => (
                    <Flex vertical align="end">
                      {r.erp.annualSpendEur ? formatEur(r.erp.annualSpendEur, 0) : <NoValue reason="No spend" />}
                      <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                        {r.erp.contractEnd ? `Ends ${formatDay(r.erp.contractEnd)}` : r.erp.contractStart ? "Open-ended" : "No contract"}
                      </Typography.Text>
                    </Flex>
                  ),
                },
              ]
            : []),
        ]}
      />

      <SupplierInfoPanel
        supplierId={open ? open.key : null}
        onClose={() => setOpenId(null)}
        user={user}
        favourites={favourites}
        onToggleFavourite={onToggleFavourite}
        decisions={decisions}
        partNames={partNames}
        onOpenDecision={onOpenDecision}
        extra={
          open && inCurrentRun.includes(open.key) ? (
            <Button size="small" onClick={() => onOpenInCockpit(open.key)}>
              Open in Compare
            </Button>
          ) : null
        }
      />
    </Card>
  );
}
