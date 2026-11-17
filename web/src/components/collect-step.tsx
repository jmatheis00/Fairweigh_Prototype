"use client";

import { ArrowLeftOutlined, ArrowRightOutlined, LoadingOutlined, StarFilled, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Skeleton, Table, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { formatDay, type AgentRun, type ErpRecord, type Offer } from "@scc/shared";
import { api } from "@/lib/api";
import type { RunSlot } from "@/lib/use-runs";
import { Relationship } from "@/lib/supplier-labels";
import { InfoTip } from "./info-tip";
import { RunProgress } from "./run-progress";

interface Props {
  partId: string;
  partName: string;
  slot: RunSlot | null;
  favourites: string[];
  /** Latest saved real run of this product, offered when the live run fails. */
  savedRun: AgentRun | null;
  onUseSaved: (run: AgentRun) => void;
  onRetry: () => void;
  onShowMissing: () => void;
  onBack: () => void;
  onNext: () => void;
}

interface Row {
  supplierId: string;
  name: string;
  relationship: string;
  favourite: boolean;
  offer: Offer;
}

/** Step 2: the suppliers asked for this part, and the agent collecting their evidence. */
export function CollectStep({ partId, partName, slot, favourites, savedRun, onUseSaved, onRetry, onShowMissing, onBack, onNext }: Props) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [erp, setErp] = useState<Record<string, ErpRecord>>({});

  useEffect(() => {
    Promise.all([api.quotations(), api.erpList()])
      .then(([o, e]) => {
        setOffers(o.filter((x) => x.partId === partId));
        setErp(Object.fromEntries(e.map((r) => [r.supplierId, r])));
      })
      .catch(() => setOffers([]));
  }, [partId]);

  // Favourites first; the full selection stays available.
  const rows: Row[] = useMemo(
    () =>
      (offers ?? [])
        .map((offer) => ({
          supplierId: offer.supplierId,
          name: erp[offer.supplierId]?.supplierName ?? offer.supplierId,
          relationship: erp[offer.supplierId]?.relationshipStatus ?? "",
          favourite: favourites.includes(offer.supplierId),
          offer,
        }))
        .sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)),
    [offers, erp, favourites],
  );
  const run = slot?.run ?? null;
  const done = slot?.status === "completed" && run !== null;
  const failed = slot?.status === "failed";
  const fromAgent = rows.filter((r) => r.relationship === "New - found by AI agent").length;

  return (
    <Card className="dash-card process-card" size="small" title="Suppliers and evidence">
      <Flex vertical gap={12}>
        <Flex gap={6} align="center">
          <Typography.Text>
            {offers === null
              ? "Loading quotations…"
              : `${rows.length} suppliers quoted${fromAgent > 0 ? `, ${fromAgent} found by the AI agent` : ""}`}
          </Typography.Text>
          <InfoTip
            label="evidence collection"
            title="The agent collects price, quality, CO₂ and delivery for each supplier from the ERP, the rating partner, the CO₂ exchange and the supplier documents. Code checks every value against its source."
          />
        </Flex>
        {/* Placeholder rows while the quotations load, never an empty "No data" table (16 Nov 2026). */}
        {offers === null ? (
          <Skeleton active title={false} paragraph={{ rows: 5 }} />
        ) : (
          <Table<Row>
            size="small"
            rowKey="supplierId"
            pagination={false}
            dataSource={rows}
            columns={[
              {
                title: "Supplier",
                key: "name",
                render: (_, r) => (
                  <Flex gap={6} align="center" wrap>
                    {r.favourite && <StarFilled aria-label="Favourite" className="fav-star" />}
                    <span>{r.name}</span>
                  </Flex>
                ),
              },
              { title: "Relationship", key: "rel", width: 220, render: (_, r) => <Relationship status={r.relationship} /> },
              {
                title: "Quoted",
                key: "doc",
                width: 140,
                render: (_, r) => (
                  <Tooltip title={`Document ${r.offer.sourceDocumentId}`}>
                    <span>{formatDay(r.offer.priceDate)}</span>
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
        {!slot && <Collecting />}
        {run && <RunProgress run={run} request={partName} />}
        {slot && !run && slot.status !== "completed" &&
          (failed ? (
            <Typography.Text type="danger">
              <WarningOutlined /> The agent could not start: {slot.error ?? "unknown error"}
            </Typography.Text>
          ) : (
            <Collecting />
          ))}
        {failed && (
          <Alert
            type="warning"
            showIcon
            title="AI not available right now."
            description={savedRun ? `A saved real run from ${formatDay(savedRun.startedAt)} exists for this product.` : "Try again in a moment."}
            action={
              <Flex vertical gap={6}>
                {savedRun && (
                  <Button size="small" onClick={() => onUseSaved(savedRun)}>
                    Show saved run from {formatDay(savedRun.startedAt)}
                  </Button>
                )}
                <Button size="small" onClick={onRetry}>
                  Try again
                </Button>
              </Flex>
            }
          />
        )}
        {done && (
          <Flex gap={6} align="center">
            <Typography.Text>
              {run.evidence.filter((e) => e.status === "verified").length} values verified · {run.gaps.length} gap{run.gaps.length === 1 ? "" : "s"}
            </Typography.Text>
            {run.gaps.length > 0 && <InfoTip label="gaps" title="Gaps count as 0 points until the data is requested." />}
          </Flex>
        )}
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            Back
          </Button>
          {done && (
            <Flex gap={8}>
              {run.gaps.length > 0 && <Button onClick={onShowMissing}>Request missing data</Button>}
              <Button type="primary" icon={<ArrowRightOutlined />} iconPlacement="end" onClick={onNext}>
                Next: compare
              </Button>
            </Flex>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}

/** Shown until the agent reports its first step. */
function Collecting() {
  return (
    <Typography.Text type="secondary">
      <LoadingOutlined /> Collecting evidence from 4 systems…
    </Typography.Text>
  );
}
