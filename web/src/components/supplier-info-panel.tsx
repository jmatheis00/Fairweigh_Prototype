"use client";

import { MinusCircleOutlined } from "@ant-design/icons";
import { Descriptions, Flex, Typography } from "antd";
import { useEffect, useState, type ReactNode } from "react";
import { formatDay, type DecisionRecord, type ErpRecord, type PcfRecord, type RatingRecord } from "@scc/shared";
import { api } from "@/lib/api";
import { DRAWER_WIDTH } from "@/lib/layout";
import { SYSTEM_LABEL, formatNumber, formatEur } from "@/lib/labels";
import type { DemoUser } from "@/lib/users";
import { Co2Source, Relationship, hasNoOrders } from "@/lib/supplier-labels";
import { PcfBadgeTag } from "./pcf-badge-tag";
import { PdfLink } from "./pdf-link";
import { RiskLevelTag } from "./risk-level-tag";
import { FavouriteButton, PreviousDecisions } from "./previous-decisions";
import { SidePanel } from "./side-panel";
import { SupplierHistory } from "./supplier-history";

/** LkSG country risk as icon plus word (never colour alone). */
export function RiskTag({ risk }: { risk: RatingRecord["lksgCountryRisk"] }) {
  if (risk === null) return <Typography.Text type="secondary"><MinusCircleOutlined /> Not rated</Typography.Text>;
  return <RiskLevelTag level={risk} />;
}

interface Props {
  /** Supplier to show; null closes the panel. */
  supplierId: string | null;
  onClose: () => void;
  user: DemoUser;
  favourites: string[];
  onToggleFavourite: (supplierId: string) => void;
  decisions: DecisionRecord[];
  partNames: Record<string, string>;
  onOpenDecision: (record: DecisionRecord) => void;
  /** Extra header buttons, e.g. "Open in Compare". */
  extra?: ReactNode;
  /** Facts from where the panel was opened (e.g. the chart on the sustainability page), shown first. */
  context?: ReactNode;
}

/**
 * Supplier info in a side panel: ERP, rating partner, CO₂ per part, previous decisions and history.
 * Used on the suppliers page and on Results, so a supplier link opens this panel and the page stays (feedback 17 Nov 2026).
 */
export function SupplierInfoPanel({ supplierId, onClose, user, favourites, onToggleFavourite, decisions, partNames, onOpenDecision, extra, context }: Props) {
  const [erpList, setErpList] = useState<ErpRecord[]>([]);
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [pcf, setPcf] = useState<PcfRecord[]>([]);

  useEffect(() => {
    Promise.all([api.erpList(), api.ratingList(), api.pcfList()])
      .then(([e, r, f]) => {
        setErpList(e);
        setRatings(r);
        setPcf(f);
      })
      .catch(() => undefined);
  }, []);

  const erp = erpList.find((e) => e.supplierId === supplierId) ?? null;
  const rating = ratings.find((r) => r.supplierId === supplierId) ?? null;

  return (
    <SidePanel
      open={supplierId !== null}
      contentKey={supplierId}
      onClose={onClose}
      size={DRAWER_WIDTH}
      title={erp ? erp.supplierName : ""}
      extra={
        supplierId && erp ? (
          <Flex gap={8}>
            <FavouriteButton favourite={favourites.includes(supplierId)} onToggle={() => onToggleFavourite(supplierId)} name={erp.supplierName} />
            {extra}
          </Flex>
        ) : null
      }
    >
      {supplierId && erp && (
        <Flex vertical gap={16}>
          {context}
          <Descriptions
            size="small"
            column={1}
            bordered
            title={`${SYSTEM_LABEL.erp} · ${erp.recordId}`}
            items={[
              { label: "Location", children: `${erp.city}, ${erp.country}` },
              { label: "Category", children: erp.category },
              { label: "Products", children: erp.products },
              { label: "Relationship", children: <><Relationship status={erp.relationshipStatus} /> <Typography.Text type="secondary">(in the ERP: {erp.relationshipStatus})</Typography.Text></> },
              ...(user.seesCommercials
                ? [
                    { label: "Contract", children: erp.contractStart ? `${formatDay(erp.contractStart)} – ${erp.contractEnd ? formatDay(erp.contractEnd) : "open-ended"}` : "No contract" },
                    { label: "Spend / year", children: erp.annualSpendEur ? formatEur(erp.annualSpendEur, 0) : "No spend" },
                  ]
                : []),
              { label: "Price index", children: erp.priceIndex ?? "No data" },
              { label: "Lead time", children: erp.leadTimeDays === null ? "No data" : `${erp.leadTimeDays} days` },
              { label: "On-time delivery", children: erp.onTimeDeliveryPercent === null ? (hasNoOrders(erp.relationshipStatus) ? "No orders yet" : "Data missing") : `${formatNumber(erp.onTimeDeliveryPercent, 0)} %` },
              { label: "Complaint rate", children: erp.complaintRatePercent === null ? (hasNoOrders(erp.relationshipStatus) ? "No orders yet" : "Data missing") : `${formatNumber(erp.complaintRatePercent, 1)} %` },
              { label: "Source", children: `Client ERP · ${erp.recordId}` },
            ]}
          />
          {rating && (
            <Descriptions
              size="small"
              column={1}
              bordered
              title={`${SYSTEM_LABEL.ratings} · ${rating.recordId}`}
              extra={<PdfLink documentId={rating.scorecardDocumentId} label="Open scorecard (PDF)" />}
              items={[
                { label: "Sustainability rating", children: rating.sustainabilityScore === null ? "Not rated" : `${rating.sustainabilityScore} of 100` },
                { label: "LkSG country risk", children: <RiskTag risk={rating.lksgCountryRisk} /> },
                { label: "Controversies", children: rating.controversies ?? "No data" },
                { label: "Certifications", children: rating.certifications ?? "None stated" },
                { label: "SBTi target", children: rating.sbtiTarget === null ? "No data" : rating.sbtiTarget ? "Yes" : "No" },
                { label: "Sustainability report", children: rating.sustainabilityReport === null ? "No data" : rating.sustainabilityReport ? "Yes" : "No" },
                { label: "Company CO₂ data", children: <Co2Source source={rating.co2DataSource} /> },
                { label: "Last updated", children: rating.lastUpdated ? formatDay(rating.lastUpdated) : "No date" },
              ]}
            />
          )}
          {/* Part-level CO₂ (review 16 Nov 2026): the same four data-quality levels as in the cockpit, kept apart
              from the company-wide source above, which the levels do not describe. */}
          {pcf.some((f) => f.supplierId === supplierId) && (
            <Descriptions
              size="small"
              column={1}
              bordered
              title={`${SYSTEM_LABEL.pcf} · CO₂ per part`}
              items={pcf
                .filter((f) => f.supplierId === supplierId)
                .map((f) => ({
                  key: f.partId,
                  label: partNames[f.partId] ?? f.partId,
                  children: (
                    <Flex gap={8} align="center" wrap>
                      <span>{formatNumber(f.pcfKgPerPiece, 1)} kg CO₂e per piece</span>
                      <PcfBadgeTag badge={f.badge} />
                    </Flex>
                  ),
                }))}
            />
          )}
          <PreviousDecisions supplierId={supplierId} decisions={decisions} partNames={partNames} onOpen={onOpenDecision} />
          <SupplierHistory supplierId={supplierId} />
        </Flex>
      )}
    </SidePanel>
  );
}
