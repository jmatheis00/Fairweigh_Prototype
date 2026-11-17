"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import type { ReactNode } from "react";

/** The same "i" icon everywhere (expert interviews, 10 Nov 2026): a short explanation, details in the glossary. */
export function InfoTip({ title, label }: { title: ReactNode; label: string }) {
  return (
    <Tooltip title={title}>
      <InfoCircleOutlined
        tabIndex={0}
        role="img"
        aria-label={`About ${label}`}
        className="info-tip"
      />
    </Tooltip>
  );
}
