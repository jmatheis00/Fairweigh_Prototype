"use client";

import { StarFilled, StarOutlined } from "@ant-design/icons";
import { Button, Table, Tooltip, Typography } from "antd";
import type { DecisionRecord } from "@scc/shared";
import { formatDateTime } from "@/lib/labels";

/** "Previous decisions with this supplier" (expert interviews, 10 Nov 2026): awarded or compared. */
export function PreviousDecisions({
  supplierId,
  decisions,
  partNames,
  onOpen,
}: {
  supplierId: string;
  decisions: DecisionRecord[];
  partNames: Record<string, string>;
  onOpen?: (record: DecisionRecord) => void;
}) {
  const mine = decisions
    .filter((d) => d.ranking.some((r) => r.supplierId === supplierId))
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  // Nothing recorded yet: one quiet line instead of a heading and an empty-state picture (feedback 17 Nov 2026).
  if (mine.length === 0)
    return (
      <Typography.Text type="secondary">
        No previous decisions with this supplier.
      </Typography.Text>
    );
  return (
    <div>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Previous decisions with this supplier ({mine.length})
      </Typography.Title>
      <Table<DecisionRecord>
        size="small"
        rowKey="recordId"
        pagination={false}
        dataSource={mine}
        columns={[
          {
            title: "Decision",
            key: "what",
            render: (_, d) => (
              <>
                <div>
                  {partNames[d.partId] ?? d.partId} ·{" "}
                  {d.chosenSupplierId === supplierId
                    ? "awarded"
                    : "compared, not awarded"}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatDateTime(d.recordedAt)}
                  {d.decidedBy ? ` · ${d.decidedBy.name}` : ""}
                  {d.mode.kind === "example" ? " · example" : ""}
                </Typography.Text>
              </>
            ),
          },
          ...(onOpen
            ? [
                {
                  title: "",
                  key: "open",
                  width: 90,
                  align: "right" as const,
                  render: (_: unknown, d: DecisionRecord) => (
                    <Button size="small" onClick={() => onOpen(d)}>
                      Details
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/** Star-only toggle; the full text is in the tooltip and the aria-label, so it stays accessible. */
export function FavouriteButton({
  favourite,
  onToggle,
  name,
}: {
  favourite: boolean;
  onToggle: () => void;
  name: string;
}) {
  const text = favourite ? "Remove from favourites" : "Mark as favourite";
  return (
    <Tooltip title={text}>
      <Button
        size="small"
        icon={
          favourite ? <StarFilled className="fav-star" /> : <StarOutlined />
        }
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={`${text}: ${name}`}
        aria-pressed={favourite}
      />
    </Tooltip>
  );
}
