"use client";

import { CheckCircleOutlined, ExclamationCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { Tag } from "antd";

/**
 * One look for every risk level in the app (16 Nov 2026): LkSG country risk, risk-monitoring alerts and
 * supplier details. High red, Medium yellow, Low green, each with its own icon and the word, never colour alone.
 */
export type RiskWord = "High" | "Medium" | "Low";

const STYLE: Record<RiskWord, { color: string; icon: React.ReactNode }> = {
  High: { color: "error", icon: <ExclamationCircleOutlined /> },
  Medium: { color: "warning", icon: <WarningOutlined /> },
  Low: { color: "success", icon: <CheckCircleOutlined /> },
};

export function RiskLevelTag({ level, style }: { level: RiskWord; style?: React.CSSProperties }) {
  return (
    <Tag color={STYLE[level].color} icon={STYLE[level].icon} style={{ marginInlineEnd: 0, ...style }}>
      {level}
    </Tag>
  );
}
