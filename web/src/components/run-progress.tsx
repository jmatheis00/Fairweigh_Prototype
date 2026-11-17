"use client";

import { LoadingOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Flex, Typography } from "antd";
import { useState } from "react";
import { runModeLabel, type AgentRun } from "@scc/shared";
import { formatDateTime } from "@/lib/labels";
import { SidePanel } from "./side-panel";

/** One status line; run metadata and the full step log in a side panel. */
export function RunProgress({ run, request }: { run: AgentRun; request: string }) {
  const [open, setOpen] = useState(false);
  const last = run.steps.at(-1);
  const verified = run.evidence.filter((e) => e.status === "verified").length;
  const line =
    run.status === "running"
      ? last
        ? `Agent running · step ${run.steps.length}: ${last.summary}`
        : "Collecting evidence from 4 systems…"
      : run.status === "completed"
        ? `${runModeLabel(run.mode)} · ${formatDateTime(run.finishedAt ?? run.startedAt)}`
        : `Run failed: ${run.error ?? "unknown error"}`;

  return (
    <Flex gap={8} align="center" wrap>
      <Typography.Text type={run.status === "failed" ? "danger" : "secondary"}>
        {run.status === "running" && <LoadingOutlined />} {line}
      </Typography.Text>
      <Button type="link" size="small" onClick={() => setOpen(true)} style={{ padding: 0 }}>
        Run details
      </Button>
      <SidePanel title={`Run details · ${request}`} open={open} onClose={() => setOpen(false)} size={480}>
        {run.status === "failed" && (
          <Alert type="error" showIcon title="The agent could not finish" description={run.error} style={{ marginBottom: 12 }} />
        )}
        <Descriptions
          size="small"
          column={1}
          style={{ marginBottom: 16 }}
          items={[
            { key: "mode", label: "Mode", children: runModeLabel(run.mode) },
            { key: "start", label: "Started", children: formatDateTime(run.startedAt) },
            { key: "end", label: "Finished", children: run.finishedAt ? formatDateTime(run.finishedAt) : "-" },
            { key: "ev", label: "Evidence check", children: `${verified} verified, ${run.evidence.length - verified} not verified` },
          ]}
        />
        <Typography.Text strong>Steps</Typography.Text>
        <ol style={{ margin: "8px 0 0", paddingLeft: 24, lineHeight: 1.8 }}>
          {run.steps.map((step) => (
            <li key={step.index}>{step.summary}</li>
          ))}
        </ol>
      </SidePanel>
    </Flex>
  );
}
