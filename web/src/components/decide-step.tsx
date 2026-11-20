"use client";

import { ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, CheckOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Descriptions, Flex, Form, Input, Select } from "antd";
import { useState } from "react";
import {
  CRITERIA,
  buildDecisionRecord,
  compareWithBaseline,
  weightsDeviate,
  type AgentRun,
  type TargetRow,
  type DecidedBy,
  type DecisionRecord,
  type DecisionResult,
  type Benchmarks,
  type Weights,
} from "@scc/shared";
import { TOPIC_LABEL, formatNumber, formatEur, formatVsToday } from "@/lib/labels";
import { InfoTip } from "./info-tip";

/** A comparison value: lower is better (cost, CO₂). Better in the app's green (tone-good) with a down arrow, worse in red (tone-bad) with an up arrow; the words carry the meaning too. Both pass WCAG AA contrast, unlike antd's success/danger text. */
function Delta({ delta, more, less, same }: { delta: number; more: string; less: string; same: string }) {
  if (delta < 0)
    return (
      <span className="tone-good">
        <ArrowDownOutlined aria-hidden /> {less}
      </span>
    );
  if (delta > 0)
    return (
      <span className="tone-bad">
        <ArrowUpOutlined aria-hidden /> {more}
      </span>
    );
  return <>{same}</>;
}

interface Props {
  run: AgentRun;
  result: DecisionResult;
  weights: Weights;
  defaultWeights: Weights;
  /** Reference values "today", saved with the record so the calculation can be followed later. */
  reference: Benchmarks | null;
  supplierNames: Record<string, string>;
  currentSupplierId: string | null;
  co2PricePerTonneEur: number;
  decidedBy: DecidedBy;
  requisitionId: string;
  progress: (TargetRow & { year: number }) | null;
  canDecide: boolean;
  onBack: () => void;
  onRecorded: (record: DecisionRecord) => void;
}

const money = (n: number) => formatEur(Math.abs(n), 0);

/** Step 4: pick the offer; a justification is needed only when deviating from the recommendation or the default weights. */
export function DecideStep({
  run,
  result,
  weights,
  defaultWeights,
  reference,
  supplierNames,
  currentSupplierId,
  co2PricePerTonneEur,
  decidedBy,
  requisitionId,
  progress,
  canDecide,
  onBack,
  onRecorded,
}: Props) {
  const [form] = Form.useForm<{ supplierId: string; reason: string; weightsReason: string }>();
  const [error, setError] = useState<string | null>(null);
  const recommended = result.recommendation?.supplierId;
  const chosen = Form.useWatch("supplierId", form) ?? recommended;
  const deviates = chosen !== undefined && chosen !== recommended;
  const changedWeights = weightsDeviate(weights, defaultWeights);
  const name = (id: string) => supplierNames[id] ?? id;
  const cmp = chosen && currentSupplierId && chosen !== currentSupplierId ? compareWithBaseline(run, chosen, currentSupplierId, co2PricePerTonneEur) : null;
  const avoided = cmp?.co2TotalDeltaT !== null && cmp?.co2TotalDeltaT !== undefined ? -cmp.co2TotalDeltaT : null;

  const submit = () =>
    form.validateFields().then((values) => {
      try {
        onRecorded(
          buildDecisionRecord({
            run,
            result,
            weights,
            defaultWeights,
            weightsReason: values.weightsReason,
            chosenSupplierId: values.supplierId,
            reason: values.reason ?? "",
            recordId: `D-${Date.now()}`,
            recordedAt: new Date().toISOString(),
            decidedBy,
            requisitionId,
            reference,
            currentSupplierId,
            vsCurrent: cmp && currentSupplierId ? { supplierId: currentSupplierId, totalDeltaEur: cmp.totalDeltaEur, co2TotalDeltaT: cmp.co2TotalDeltaT } : null,
          }),
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })
    // The form shows its own messages next to the fields.
    .catch(() => {});

  return (
    <Card className="dash-card process-card" size="small" title="Decision">
      <Flex gap={24} wrap align="flex-start">
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ supplierId: recommended }}
          style={{ flex: "1 1 300px", minWidth: 0 }}
          disabled={!canDecide}
        >
          <Form.Item label="Award to" name="supplierId" rules={[{ required: true, message: "Choose an offer" }]}>
            <Select
              options={[
                ...result.ranked.map((r) => ({
                  value: r.supplierId,
                  label: `${r.rank}. ${name(r.supplierId)} · ${formatVsToday(r.score)}${r.supplierId === recommended ? " · recommended" : ""}`,
                })),
                ...result.excluded.map((x) => ({ value: x.supplierId, label: `${name(x.supplierId)} · excluded`, disabled: true })),
              ]}
            />
          </Form.Item>
          <Form.Item
            label={deviates ? "Justification (required: you deviate from the recommendation)" : "Comment (optional)"}
            name="reason"
            rules={deviates ? [{ required: true, message: "Please justify the deviation" }, { min: 10, message: "At least 10 characters" }] : []}
          >
            <Input.TextArea
              rows={3}
              maxLength={500}
              showCount
              placeholder={deviates ? "e.g. Existing framework contract runs until 2027." : "Leave empty to record “Follows the recommendation.”"}
            />
          </Form.Item>
          {changedWeights && (
            <>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                title="You changed the company default weights."
                description={CRITERIA.filter((c) => weights[c] !== defaultWeights[c]).map((c, i) => (
                  // Only the changed weights; each one stays on one line, so "%" never wraps alone.
                  <span key={c} style={{ whiteSpace: "nowrap" }}>
                    {i > 0 && " · "}
                    {TOPIC_LABEL[c]} {defaultWeights[c]} → {weights[c]} %
                  </span>
                ))}
              />
              <Form.Item
                label="Why did you change the weights? (saved in the Decision Log)"
                name="weightsReason"
                rules={[{ required: true, message: "Please justify the changed weights" }, { min: 10, message: "At least 10 characters" }]}
              >
                <Input.TextArea rows={2} maxLength={300} showCount placeholder="e.g. Delivery date is critical for this order." />
              </Form.Item>
            </>
          )}
          {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
        </Form>

        <Flex vertical gap={12} style={{ flex: "1 1 300px", minWidth: 0 }}>
          <Descriptions
            size="small"
            column={1}
            bordered
            title={
              <span>
                What this choice means{" "}
                <InfoTip
                  label="What this choice means"
                  title={`Fixed rules calculate the recommendation from verified evidence. You decide. The record saves your name (${decidedBy.name}), justification, weights and the evidence of the chosen offer.`}
                />
              </span>
            }
            items={[
              ...(cmp && currentSupplierId
                ? [
                    {
                      label: `Price vs. ${name(currentSupplierId)}`,
                      children:
                        cmp.totalDeltaEur === null ? (
                          "No verified price"
                        ) : (
                          <Delta
                            delta={cmp.totalDeltaEur}
                            more={`${money(cmp.totalDeltaEur)} more for ${run.request.quantity.toLocaleString("en-GB")} pcs`}
                            less={`${money(cmp.totalDeltaEur)} less for ${run.request.quantity.toLocaleString("en-GB")} pcs`}
                            same="Same price"
                          />
                        ),
                    },
                    {
                      label: "CO₂ vs. current supplier",
                      children:
                        avoided === null ? (
                          "No verified CO₂ value"
                        ) : (
                          <Delta
                            delta={-avoided}
                            more={`${formatNumber(-avoided, 1)} t CO₂e more`}
                            less={`${formatNumber(avoided, 1)} t CO₂e avoided`}
                            same="Same CO₂"
                          />
                        ),
                    },
                    // CO₂ in euros next to the price (pitch highlight, 16 Nov 2026): display only, never part of the score.
                    ...(cmp.co2CostDeltaEur !== null && co2PricePerTonneEur > 0
                      ? [
                          {
                            label: (
                              <span>
                                CO₂ in euros{" "}
                                <InfoTip
                                  label="CO₂ in euros"
                                  title={`CO₂ difference at the internal CO₂ price (${money(co2PricePerTonneEur)} per tonne). Display only: not in the score.`}
                                />
                              </span>
                            ),
                            children: (
                              <Delta
                                delta={cmp.co2CostDeltaEur}
                                more={`${money(cmp.co2CostDeltaEur)} more CO₂ cost`}
                                less={`${money(cmp.co2CostDeltaEur)} CO₂ cost avoided`}
                                same="Same CO₂ cost"
                              />
                            ),
                          },
                        ]
                      : []),
                  ]
                : [{ label: "Current supplier", children: chosen === currentSupplierId ? "You keep the current supplier" : "No current supplier for this part" }]),
              ...(progress && avoided !== null && avoided > 0
                ? [
                    {
                      label: "Your CO₂ target",
                      children: `+${formatNumber(avoided, 1)} t towards ${formatNumber(progress.targetTonnes, 0)} t (${formatNumber(progress.achievedTonnes, 1)} t achieved so far)`,
                    },
                  ]
                : []),
            ]}
          />
        </Flex>
      </Flex>
      {/* Same footer as every step (UX review, 16 Nov 2026): "Back" bottom left, the main action bottom right of the card. */}
      <Flex justify="space-between" gap={8} style={{ marginTop: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          Back
        </Button>
        <Button type="primary" icon={<CheckOutlined />} onClick={submit} disabled={!canDecide}>
          Record decision
        </Button>
      </Flex>
    </Card>
  );
}
