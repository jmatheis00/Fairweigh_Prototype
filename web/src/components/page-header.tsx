"use client";

import { Flex, Typography } from "antd";
import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  /** One sentence: the question this page answers, in plain words. */
  subtitle: string;
  /** Where the data comes from, shown on the right. */
  source?: ReactNode;
}

/** Same header on every page: title, what the page answers, and its source. */
export function PageHeader({ title, subtitle, source }: Props) {
  return (
    <Flex justify="space-between" align="flex-end" wrap gap={8}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {subtitle}
        </Typography.Text>
      </div>
      {source && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {source}
        </Typography.Text>
      )}
    </Flex>
  );
}
