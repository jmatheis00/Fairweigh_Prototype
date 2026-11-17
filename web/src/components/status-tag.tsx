import { CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import type { EvidenceStatus } from "@scc/shared";

/** Status always as icon plus text, never colour alone. */
export function StatusTag({ status }: { status: EvidenceStatus | "missing" }) {
  switch (status) {
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
