"use client";

import { AimOutlined, CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Popconfirm, Progress, Table, Tag, Tooltip, Typography } from "antd";
import {
  formatDay,
  type CatalogPart,
  type DecisionRecord,
  type ManualRequisitionInput,
  type PurchaseRequisitionRecord,
  type QueueEntry,
  type RequisitionStatus,
  type TargetRow,
} from "@scc/shared";
import { useState, type ReactNode } from "react";
import { NewRequisitionPanel } from "./new-requisition-panel";
import { formatDateTime, formatNumber } from "@/lib/labels";
import { useIsPhone } from "@/lib/use-phone";
import { InfoTip } from "./info-tip";
import { PageHeader } from "./page-header";
import { BRAND } from "@/lib/theme";

interface Props {
  queue: QueueEntry[];
  progress: (TargetRow & { year: number }) | null;
  supplierNames: Record<string, string>;
  onStart: (entry: QueueEntry) => void;
  /** Parts the buyer can add a requisition for by hand (only those with offers are offered). */
  catalog: CatalogPart[];
  onAddManual: (input: ManualRequisitionInput) => PurchaseRequisitionRecord | null;
  onRemoveManual: (recordId: string) => void;
  onResume: (entry: QueueEntry) => void;
  onOpenDecision: (record: DecisionRecord) => void;
  canRun: boolean;
  userName: string;
}

const STATUS: Record<RequisitionStatus, { icon: ReactNode; text: string }> = {
  open: { icon: <ClockCircleOutlined />, text: "Open" },
  "in progress": { icon: <SyncOutlined />, text: "In progress" },
  decided: { icon: <CheckCircleOutlined />, text: "Decided" },
};

export function StatusWord({ status }: { status: RequisitionStatus }) {
  return (
    <Tag icon={STATUS[status].icon} style={{ marginInlineEnd: 0 }}>
      {STATUS[status].text}
    </Tag>
  );
}

const daysUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

/** Start page of the buyer (expert interviews, 10 Nov 2026): what needs to be done, then the CO₂ target. */
export function WorkQueuePage({
  queue,
  progress,
  supplierNames,
  onStart,
  catalog,
  onAddManual,
  onRemoveManual,
  onResume,
  onOpenDecision,
  canRun,
  userName,
}: Props) {
  const [adding, setAdding] = useState(false);
  const open = queue.filter((e) => e.status === "open");
  const started = queue.filter((e) => e.status === "in progress");
  const done = queue.filter((e) => e.status === "decided");
  const name = (id: string) => supplierNames[id] ?? id;
  const isPhone = useIsPhone();

  const material = (e: QueueEntry) => (
    <Flex vertical>
      <span>
        <Typography.Text strong>{e.requisition.partName}</Typography.Text>
        {e.requisition.origin === "manual" && (
          <Tooltip title="Added by hand in Fairweigh, not from the ERP">
            <Tag icon={<EditOutlined />} style={{ marginInlineStart: 8 }}>
              Manual
            </Tag>
          </Tooltip>
        )}
      </span>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {e.requisition.recordId} · {e.requisition.requestedBy}
      </Typography.Text>
    </Flex>
  );
  const needed = (e: QueueEntry) => {
    const d = daysUntil(e.requisition.neededBy);
    return (
      <Flex vertical align="end">
        <span>{formatDay(e.requisition.neededBy)}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {d >= 0 ? `in ${d} days` : `${-d} days overdue`}
        </Typography.Text>
      </Flex>
    );
  };

  // Manual requisitions that were not started yet can be removed again (18 Nov 2026).
  const removeButton = (e: QueueEntry) =>
    e.requisition.origin === "manual" && (
      <Popconfirm
        title="Remove this manual requisition?"
        okText="Remove"
        cancelText="Keep"
        onConfirm={() => onRemoveManual(e.requisition.recordId)}
      >
        <Button size="small" type="text" icon={<DeleteOutlined />} aria-label={`Remove ${e.requisition.recordId}`} />
      </Popconfirm>
    );
  const startButton = (e: QueueEntry) => (
    <Flex gap={4} justify="end">
      {removeButton(e)}
      <Button
        type="primary"
        size="small"
        icon={<PlayCircleOutlined />}
        disabled={!canRun}
        onClick={() => onStart(e)}
        aria-label={`Start ${e.requisition.partName}`}
      >
        Start
      </Button>
    </Flex>
  );

  // Phones: one card per requisition instead of a wide table (10 Nov 2026).
  const phoneList = (entries: QueueEntry[], action: (e: QueueEntry) => ReactNode, empty: string, extra?: (e: QueueEntry) => ReactNode) =>
    entries.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
    ) : (
      <Flex vertical gap={8} style={{ padding: 12 }}>
        {entries.map((e) => (
          <div key={e.requisition.recordId} className="queue-item">
            {material(e)}
            <Flex justify="space-between" align="flex-start" gap={8} style={{ marginTop: 6 }}>
              <Typography.Text>
                {e.requisition.quantity.toLocaleString("en-GB")} pcs
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {e.requisition.category}
                </Typography.Text>
              </Typography.Text>
              {needed(e)}
            </Flex>
            {extra?.(e)}
            <Flex justify="space-between" align="center" gap={8} style={{ marginTop: 8 }}>
              {/* "To procure" rows are all open, so no tag there (same as the desktop table, 16 Nov 2026). */}
              {e.status !== "open" ? <StatusWord status={e.status} /> : <span />}
              {action(e)}
            </Flex>
          </div>
        ))}
      </Flex>
    );

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title={`Good to see you, ${userName}. ${open.length === 0 ? "Nothing open today." : `${open.length} purchase requisition${open.length === 1 ? "" : "s"} to procure.`}`}
        subtitle="Start a requisition: Fairweigh guides you from the requirement to the recorded decision."
        source={queue.some((e) => e.requisition.origin === "manual") ? "Purchase requisitions from the client ERP and added manually" : "Purchase requisitions from the client ERP"}
      />
      {!canRun && (
        <Alert type="info" showIcon title="View only: in this demo only the category manager starts purchase processes." />
      )}

      <div className="queue-grid">
        <Card
          className="dash-card"
          size="small"
          extra={
            <Tooltip title={canRun ? "Add a requisition that is not in the ERP yet" : "Only the category manager adds requisitions"}>
              <Button size="small" icon={<PlusOutlined />} disabled={!canRun} onClick={() => setAdding(true)}>
                New requisition
              </Button>
            </Tooltip>
          }
          title={
            <span>
              To procure ({open.length}){" "}
              <InfoTip
                label="the work queue"
                title="Open requisitions in your purchasing groups without a contract or fixed supplier. Earliest required date first."
              />
            </span>
          }
          styles={{ body: { padding: 0 } }}
        >
          {isPhone ? (
            phoneList(open, startButton, "All requisitions are in progress or decided.")
          ) : (
          <Table<QueueEntry>
            size="small"
            rowKey={(e) => e.requisition.recordId}
            pagination={false}
            dataSource={open}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="All requisitions are in progress or decided." /> }}
            columns={[
              { title: "Material", key: "material", render: (_, e) => material(e) },
              { title: "Commodity group", key: "group", width: 180, render: (_, e) => e.requisition.category },
              {
                title: "Quantity",
                key: "qty",
                width: 110,
                align: "right",
                render: (_, e) => `${e.requisition.quantity.toLocaleString("en-GB")} pcs`,
              },
              { title: "Required by", key: "date", width: 120, align: "right", render: (_, e) => needed(e) },
              { title: "", key: "start", width: 120, align: "right", render: (_, e) => startButton(e) },
            ]}
          />
          )}
        </Card>

        <Card
          className="dash-card"
          size="small"
          title={
            <span>
              <AimOutlined /> Your CO₂ target {progress ? progress.year : ""}{" "}
              <InfoTip
                label="the CO₂ target"
                title="Set by the sustainability manager. Achieved = CO₂ avoided this year by Fairweigh decisions in your commodity groups, from orders placed or, if not ordered yet, from the decision."
              />
            </span>
          }
        >
          {progress ? (
            <Flex vertical gap={8}>
              <Typography.Text>
                Save <strong>{formatNumber(progress.targetTonnes, 0)} t CO₂e</strong> this year
              </Typography.Text>
              <Progress
                percent={progress.percent}
                showInfo={false}
                strokeColor={BRAND.primary}
                aria-label={`${progress.percent} % of the CO₂ target achieved`}
              />
              <Flex justify="space-between">
                <Typography.Text>
                  <CheckCircleOutlined /> {formatNumber(progress.achievedTonnes, 1)} t achieved ({progress.percent} %)
                </Typography.Text>
                <Typography.Text type="secondary">{formatNumber(progress.remainingTonnes, 1)} t remaining</Typography.Text>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatNumber(progress.orderedTonnes, 1)} t from orders after earlier decisions
                {progress.decidedTonnes > 0 ? ` · ${formatNumber(progress.decidedTonnes, 1)} t from decisions not ordered yet` : ""}
              </Typography.Text>
            </Flex>
          ) : (
            <Typography.Text type="secondary">Loading…</Typography.Text>
          )}
        </Card>
      </div>

      <div className="queue-grid queue-grid-even">
        <Card className="dash-card" size="small" title={`My open requests (${started.length})`} styles={{ body: { padding: 0 } }}>
          {isPhone ? (
            phoneList(started, (e) => (
                <Button size="small" onClick={() => onResume(e)}>
                  Continue
                </Button>
              ), "No process started yet.")
          ) : (
          <Table<QueueEntry>
            size="small"
            rowKey={(e) => e.requisition.recordId}
            pagination={false}
            dataSource={started}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No process started yet." /> }}
            columns={[
              { title: "Material", key: "material", render: (_, e) => material(e) },
              { title: "Required by", key: "date", width: 120, align: "right", render: (_, e) => needed(e) },
              {
                title: "",
                key: "resume",
                width: 96,
                align: "right",
                render: (_, e) => (
                  <Button size="small" onClick={() => onResume(e)}>
                    Continue
                  </Button>
                ),
              },
            ]}
          />
          )}
        </Card>
        <Card className="dash-card" size="small" title={`Completed (${done.length})`} styles={{ body: { padding: 0 } }}>
          {isPhone ? (
            phoneList(
              done,
              (e) =>
                e.decision && (
                  <Button size="small" onClick={() => onOpenDecision(e.decision!)}>
                    Details
                  </Button>
                ),
              "No requisition decided yet.",
              (e) => e.decision && <Typography.Text style={{ display: "block", marginTop: 6 }}>Awarded to {name(e.decision.chosenSupplierId)}</Typography.Text>,
            )
          ) : (
          <Table<QueueEntry>
            size="small"
            rowKey={(e) => e.requisition.recordId}
            pagination={false}
            dataSource={done}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No requisition decided yet." /> }}
            columns={[
              { title: "Material", key: "material", render: (_, e) => material(e) },
              {
                title: "Awarded to",
                key: "chosen",
                render: (_, e) =>
                  e.decision && (
                    <Flex vertical>
                      <span>{name(e.decision.chosenSupplierId)}</span>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(e.decision.recordedAt)}
                      </Typography.Text>
                    </Flex>
                  ),
              },
              {
                title: "",
                key: "open",
                width: 110,
                align: "right",
                render: (_, e) =>
                  e.decision && (
                    <Tooltip title="Open the record in the Decision Log">
                      <Button size="small" onClick={() => onOpenDecision(e.decision!)}>
                        Details
                      </Button>
                    </Tooltip>
                  ),
              },
            ]}
          />
          )}
        </Card>
      </div>
      <NewRequisitionPanel
        open={adding}
        onClose={() => setAdding(false)}
        catalog={catalog}
        plants={[...new Set(queue.map((e) => e.requisition.requestedBy))]}
        onAdd={onAddManual}
      />
    </Flex>
  );
}
