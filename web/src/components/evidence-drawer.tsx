"use client";

import { ExportOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Spin, Table, Tag, Typography } from "antd";
import { SidePanel } from "./side-panel";
import { useEffect, useState } from "react";
import type { DocumentRecord, Evidence } from "@scc/shared";
import { api } from "@/lib/api";
import { DRAWER_WIDTH } from "@/lib/layout";
import { SYSTEM_LABEL, TOPIC_LABEL, formatDateTime } from "@/lib/labels";
import { SOURCE_SYSTEMS, formatDay } from "@scc/shared";
import { formatValue } from "./evidence-table";
import { StatusTag } from "./status-tag";
import { PdfLink } from "./pdf-link";


type Source =
  | { kind: "record"; record: Record<string, unknown> }
  | { kind: "document"; document: DocumentRecord };

async function loadSource(e: Evidence, partId: string): Promise<Source> {
  switch (e.system) {
    case "erp":
      return { kind: "record", record: { ...(await api.erp(e.supplierId)) } };
    case "ratings":
      return { kind: "record", record: { ...(await api.rating(e.supplierId)) } };
    case "pcf":
      return { kind: "record", record: { ...(await api.pcf(e.supplierId, partId)) } };
    case "documents":
      return { kind: "document", document: await api.document(e.recordId) };
  }
}

const HIDDEN_FIELDS = new Set(["provenance", "notice", "system", "supplierId", "partId", "datasheetDocumentId", "scorecardDocumentId", "documentId"]);

/** Field names of the source records in plain words; the technical name stays in the tooltip. */
const FIELD_LABEL: Record<string, string> = {
  recordId: "Record",
  supplierName: "Supplier",
  pcfKgPerPiece: "CO₂ per piece (kg CO₂e)",
  badge: "Data quality",
  referenceDate: "Reference date",
  referenceYear: "Reference year",
  method: "Method",
  boundary: "System boundary",
  primaryDataSharePercent: "Primary data share (%)",
  assurance: "Third-party assurance",
  source: "Source",
  onTimeDeliveryPercent: "On-time delivery (%)",
  complaintRatePercent: "Complaint rate (%)",
  leadTimeDays: "Lead time (days)",
  priceIndex: "Price index",
  relationshipStatus: "Relationship",
  annualSpendEur: "Spend per year (€)",
  contractStart: "Contract start",
  contractEnd: "Contract end",
  lastUpdated: "Last updated",
  category: "Category",
  products: "Products",
  country: "Country",
  city: "City",
  vatId: "VAT ID",
  erpId: "ERP ID",
  sustainabilityScore: "Sustainability rating (0–100)",
  lksgCountryRisk: "LkSG country risk",
  certifications: "Certifications",
  sbtiTarget: "SBTi target",
  controversies: "Controversies",
  co2DataSource: "Company CO₂ data",
  sustainabilityReport: "Sustainability report",
  infoRequestStatus: "Information request",
};

const fieldLabel = (key: string) => FIELD_LABEL[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).filter((v) => v !== null && v !== "").join(" · ");
  return String(value as string | number | boolean);
}

/** The record with the cited field marked by background and a "Cited" tag. */
function RecordView({ record, field }: { record: Record<string, unknown>; field: string | null }) {
  const rows = Object.entries(record)
    .filter(([key]) => !HIDDEN_FIELDS.has(key))
    .map(([key, value]) => ({ key, value: cellText(value) }));
  return (
    <Table
      size="small"
      pagination={false}
      dataSource={rows}
      rowClassName={(row) => (row.key === field ? "row-cited" : "")}
      columns={[
        {
          title: "Field",
          dataIndex: "key",
          width: "46%",
          render: (key: string) => (
            <span title={key}>
              {fieldLabel(key)}
              {key === field && <Tag style={{ marginLeft: 8 }}>Cited</Tag>}
            </span>
          ),
        },
        { title: "Value", dataIndex: "value", align: "right" },
      ]}
    />
  );
}

/** The page text with the cited line marked; the PDF opens in a new tab. */
function DocumentView({ document, page, quote }: { document: DocumentRecord; page: number; quote: string }) {
  const pageText = document.pages.find((p) => p.page === page);
  const wanted = quote.replace(/\s+/g, " ").trim();
  return (
    <>
      <Button icon={<ExportOutlined />} href={api.documentFileUrl(document.documentId, page)} target="_blank" style={{ marginBottom: 12 }}>
        Open PDF, page {page}
      </Button>
      <div className="document-page" aria-label={`Text of page ${page}`}>
        {(pageText?.lines ?? []).map((line, i) => {
          const cited = wanted.length > 0 && line.replace(/\s+/g, " ").includes(wanted);
          return (
            <div key={i} className={cited ? "line-cited" : undefined}>
              {cited ? <mark>{line}</mark> : line}
              {cited && <Tag style={{ marginLeft: 8 }}>Cited</Tag>}
            </div>
          );
        })}
      </div>
    </>
  );
}

interface Props {
  evidence: Evidence | null;
  partId: string;
  supplierName: string;
  onClose: () => void;
}

/** Side panel: details of one piece of evidence and its source. The table stays visible. */
export function EvidenceDrawer({ evidence, partId, supplierName, onClose }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!evidence) return;
    let active = true;
    loadSource(evidence, partId)
      .then((s) => {
        if (active) {
          setSource(s);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      active = false;
      setSource(null);
      setError(null);
    };
  }, [evidence, partId]);

  // Bring the cited field or line into view, without animation.
  useEffect(() => {
    if (source) document.querySelector(".row-cited, .line-cited")?.scrollIntoView({ block: "center" });
  }, [source]);

  const location = evidence?.location;
  return (
    <SidePanel
      open={evidence !== null}
      contentKey={evidence?.evidenceId}
      onClose={onClose}
      size={DRAWER_WIDTH}
      title={evidence ? `${TOPIC_LABEL[evidence.topic]} · ${supplierName}` : ""}
    >
      {evidence && (
        <>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: "value", label: "Value", children: formatValue(evidence) },
              { key: "sentence", label: "Agent says", children: evidence.sentence },
              { key: "status", label: "Check", children: <StatusTag status={evidence.status} /> },
              {
                key: "system",
                label: "System",
                children: (
                  <span title={SOURCE_SYSTEMS[evidence.system].simulates}>{SYSTEM_LABEL[evidence.system]}</span>
                ),
              },
              { key: "record", label: "Record or document", children: evidence.recordId },
              {
                key: "location",
                label: "Location",
                children: location?.kind === "field" ? `Field "${fieldLabel(location.field)}"` : `Page ${location?.page}: "${location?.kind === "document" ? location.quote : ""}"`,
              },
              {
                key: "asOf",
                label: "Data as of",
                children: evidence.sourceDate ? formatDay(evidence.sourceDate) : "No date in the source",
              },
              {
                key: "retrieved",
                label: "Retrieved by the agent",
                children: evidence.retrievedAt ? formatDateTime(evidence.retrievedAt) : "Not retrieved in this run",
              },
            ]}
          />
          {evidence.checkFailures.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 12 }}
              title="Why the check failed"
              description={<ul style={{ margin: 0, paddingLeft: 16 }}>{evidence.checkFailures.map((f) => <li key={f}>{f}</li>)}</ul>}
            />
          )}
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            Source: {evidence.recordId}
          </Typography.Title>
          {error && <Alert type="error" showIcon title="Source could not be opened" description={error} />}
          {!source && !error && <Spin />}
          {source?.kind === "record" && (
            <>
              <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
                <PdfLink documentId={source.record["scorecardDocumentId"] as string | null | undefined} label="Open scorecard (PDF)" />
                <PdfLink documentId={source.record["datasheetDocumentId"] as string | null | undefined} label="Open PCF data sheet (PDF)" />
              </div>
              <RecordView record={source.record} field={location?.kind === "field" ? location.field : null} />
            </>
          )}
          {source?.kind === "document" && location?.kind === "document" && (
            <DocumentView document={source.document} page={location.page} quote={location.quote} />
          )}
        </>
      )}
    </SidePanel>
  );
}
