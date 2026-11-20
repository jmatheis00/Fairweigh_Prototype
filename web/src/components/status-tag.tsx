import { CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import type { EvidenceStatus } from "@scc/shared";

/** Status always as icon plus text, never colour alone. */
export function StatusTag({ status }: { status: EvidenceStatus | "missing" | "range" | "no_deliveries" }) {
  switch (status) {
    // A supplier that never delivered: quality and delivery are scored as a range, ranked after real data (8 and 18 Nov 2026).
    case "range":
      return <Tag color="warning" icon={<MinusCircleOutlined />}>No deliveries · range</Tag>;
    // The same gap for an excluded offer, which gets no score at all.
    case "no_deliveries":
      return <Tag icon={<MinusCircleOutlined />}>No deliveries</Tag>;
    case "verified":
      return <Tag color="success" icon={<CheckCircleOutlined />}>Verified</Tag>;
    case "not_verified":
      return <Tag color="error" icon={<CloseCircleOutlined />}>Not verified · 0 points</Tag>;
    case "missing":
      return <Tag color="warning" icon={<MinusCircleOutlined />}>Data missing · 0 points</Tag>;
    default:
      return <Tag icon={<QuestionCircleOutlined />}>Unchecked</Tag>;
  }
}
