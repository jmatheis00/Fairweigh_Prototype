"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Flex, Progress, Steps, Typography } from "antd";
import { formatDay, type ProcessStep, type PurchaseRequisitionRecord } from "@scc/shared";
import { useIsPhone } from "@/lib/use-phone";
import { BRAND } from "@/lib/theme";

/** The five steps of a purchase (expert interviews, 10 Nov 2026). */
export const PROCESS_STEPS = ["Request", "Collect", "Compare", "Decide", "Complete"] as const;
export type { ProcessStep };

interface Props {
  requisition: PurchaseRequisitionRecord;
  quantity: number;
  neededBy: string | null;
  step: ProcessStep;
  /** Furthest step reached; earlier steps can be reopened. */
  reached: ProcessStep;
  onStep: (step: ProcessStep) => void;
  /** The next step can be clicked like the "Next" button, only when "Next" would work (16 Nov 2026). */
  canAdvance: boolean;
  onAdvance: () => void;
  onBackToQueue: () => void;
}

/** Progress bar at the top of the purchase process, like a booking website. */
export function ProcessSteps({ requisition, quantity, neededBy, step, reached, onStep, canAdvance, onAdvance, onBackToQueue }: Props) {
  const completed = reached === 4;
  // "Complete" is never a click on the bar: recording a decision stays the deliberate "Record decision".
  const advanceable = canAdvance && step + 1 < PROCESS_STEPS.length - 1;
  const isPhone = useIsPhone();
  const facts = `${quantity.toLocaleString("en-GB")} pcs${neededBy ? ` · required by ${formatDay(neededBy)}` : ""} · ${requisition.recordId}`;

  // Phones: one line per fact and a compact step bar instead of five labelled steps.
  if (isPhone) {
    return (
      <Flex vertical gap={4} className="process-bar">
        <Flex align="center" gap={4} style={{ minWidth: 0 }}>
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={onBackToQueue} aria-label="Back to the work queue" />
          <Typography.Text strong ellipsis style={{ minWidth: 0 }}>
            {requisition.partName}
          </Typography.Text>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {facts}
        </Typography.Text>
        <Flex justify="space-between" align="center" gap={8}>
          <Typography.Text>
            Step {step + 1} of {PROCESS_STEPS.length}: <strong>{PROCESS_STEPS[step]}</strong>
          </Typography.Text>
          {!completed && step > 0 && (
            <Button size="small" onClick={() => onStep((step - 1) as ProcessStep)}>
              Previous step
            </Button>
          )}
        </Flex>
        <Progress
          percent={((step + 1) / PROCESS_STEPS.length) * 100}
          steps={PROCESS_STEPS.length}
          showInfo={false}
          strokeColor={BRAND.primary}
          size={{ width: 60, height: 6 }}
          aria-label={`Step ${step + 1} of ${PROCESS_STEPS.length}`}
        />
      </Flex>
    );
  }

  return (
    <Flex vertical gap={6} className="process-bar">
      <Flex justify="space-between" align="center" gap={12} wrap>
        <Flex align="center" gap={8} style={{ minWidth: 0 }}>
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={onBackToQueue}>
            Work queue
          </Button>
          <Typography.Text strong ellipsis>
            {requisition.partName}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ whiteSpace: "nowrap" }}>
            · {facts}
          </Typography.Text>
        </Flex>
      </Flex>
      <Steps
        size="small"
        current={step}
        onChange={(next) => {
          // After completion the record is final; before, any step reached can be reopened.
          if (completed) return;
          if (next <= reached) onStep(next as ProcessStep);
          else if (next === step + 1 && advanceable) onAdvance();
        }}
        items={PROCESS_STEPS.map((title, i) => ({
          title,
          disabled: completed ? i !== 4 : i > reached && !(i === step + 1 && advanceable),
          status: i < step || (completed && i <= 4) ? "finish" : i === step ? "process" : "wait",
        }))}
      />
    </Flex>
  );
}
