"use client";

import { Descriptions, Modal } from "antd";
import { runModeLabel, type RunMode } from "@scc/shared";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: RunMode | null;
  /** Live AI runs used today and the daily limit, when the mode is live. */
  usage: { liveRunsToday: number; dailyLimit: number } | null;
  /** Which AI service collects the evidence, e.g. "Google Gemini API". */
  aiService: string;
}

/**
 * "About Fairweigh" in the help menu (16 Nov 2026). Replaces the fixed line at the bottom of the screen:
 * AI mode, ranking and the sample-data notice stay findable without sitting on every page.
 */
export function AboutDialog({ open, onClose, mode, usage, aiService }: Props) {
  return (
    <Modal open={open} onCancel={onClose} onOk={onClose} cancelButtonProps={{ style: { display: "none" } }} okText="Close" title="About Fairweigh" width={520}>
      <Descriptions
        size="small"
        column={1}
        bordered
        items={[
          { key: "mode", label: "AI mode", children: mode ? runModeLabel(mode) : "-" },
          { key: "ai", label: "Evidence collected by", children: aiService },
          ...(mode?.kind === "live" && usage
            ? [{ key: "runs", label: "Live runs today", children: `${usage.liveRunsToday} of ${usage.dailyLimit}` }]
            : []),
          { key: "rank", label: "Ranking", children: "Fixed rules, not AI. The buyer decides." },
          { key: "data", label: "Data", children: "Prototype with sample data. All companies, values and documents are invented." },
        ]}
      />
    </Modal>
  );
}
