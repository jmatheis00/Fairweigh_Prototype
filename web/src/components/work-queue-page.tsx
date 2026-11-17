"use client";

import { AimOutlined, CheckCircleOutlined, ClockCircleOutlined, PlayCircleOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Progress, Table, Tag, Tooltip, Typography } from "antd";
import { formatDay, type TargetRow, type DecisionRecord, type QueueEntry, type RequisitionStatus } from "@scc/shared";
import type { ReactNode } from "react";
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
export function WorkQueuePage({ queue, progress, supplierNames, onStart, onResume, onOpenDecision, canRun, userName }: Props) {
  const open = queue.filter((e) => e.status === "open");
  const started = queue.filter((e) => e.status === "in progress");
  const done = queue.filter((e) => e.status === "decided");
  const name = (id: string) => supplierNames[id] ?? id;
  const isPhone = useIsPhone();

  const material = (e: QueueEntry) => (
    <Flex vertical>
      <Typography.Text strong>{e.requisition.partName}</Typography.Text>
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
        source="Purchase requisitions from the client ERP"
      />
      {!canRun && (
        <Alert type="info" showIcon title="View only: in this demo only the category manager starts purchase processes." />
      )}

      <div className="queue-grid">
        <Card
          className="dash-card"
          size="small"
          title={
            <span>
              To procure ({open.length}){" "}
              <InfoTip
                label="the work queue"
                title="Open purchase requisitions of your purchasing groups that have no contract or fixed supplier yet, earliest required date first. Start one to collect offers, compare and decide."
              />
            </span>
          }
          styles={{ body: { padding: 0 } }}
        >
          {isPhone ? (
            phoneList(open, (e) => (
                <Button type="primary" size="small" icon={<PlayCircleOutlined />} disabled={!canRun} onClick={() => onStart(e)}>
                  Start
                </Button>
              ), "All requisitions are in progress or decided.")
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
              {
                title: "",
                key: "start",
                width: 96,
                align: "right",
                render: (_, e) => (
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
                ),
              },
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
                title="Set by the Scope 3 manager. Achieved = CO₂ avoided by your Fairweigh decisions this year: ordered after a supplier switch, plus decisions recorded here that have no orders yet."
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
    </Flex>
  );
}
