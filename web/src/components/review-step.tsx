"use client";

import { ArrowRightOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Descriptions, Flex, Form, InputNumber } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { FormInstance } from "antd";
import { useEffect } from "react";
import { formatDay, type PurchaseRequisitionRecord } from "@scc/shared";
import { InfoTip } from "./info-tip";

interface Props {
  requisition: PurchaseRequisitionRecord;
  quantity: number;
  neededBy: string | null;
  canRun: boolean;
  onNext: (quantity: number, neededBy: string | null) => void;
  /** Lets the progress bar submit the form like "Next" (16 Nov 2026). */
  form?: FormInstance<RequirementValues>;
}

export type RequirementValues = { quantity: number; neededBy: Dayjs | null };

/** Step 1: the requirement from the ERP, quantity and date editable. */
export function ReviewStep({ requisition, quantity, neededBy, canRun, onNext, form: outer }: Props) {
  const [own] = Form.useForm<RequirementValues>();
  const form = outer ?? own;
  // The form instance can outlive one requisition (the progress bar holds it), so load this requisition's values.
  useEffect(() => {
    form.setFieldsValue({ quantity, neededBy: neededBy ? dayjs(neededBy) : null });
  }, [form, requisition.recordId, quantity, neededBy]);
  return (
    <Card className="dash-card process-card" size="small" title="Request">
      <Flex gap={24} wrap align="flex-start">
        <Descriptions
          size="small"
          column={1}
          bordered
          style={{ flex: "1 1 300px", minWidth: 0 }}
          title={requisition.origin === "manual" ? "Added manually in Fairweigh" : "From the client ERP"}
          items={[
            { label: "Requisition", children: requisition.recordId },
            { label: "Material", children: `${requisition.partName} (${requisition.partId})` },
            { label: "Commodity group", children: requisition.category },
            { label: "Requested by", children: requisition.requestedBy },
            { label: "Created on", children: formatDay(requisition.createdOn) },
          ]}
        />
        <Form
          form={form}
          layout="vertical"
          requiredMark={false}
          style={{ flex: "1 1 260px", minWidth: 0 }}
          initialValues={{ quantity, neededBy: neededBy ? dayjs(neededBy) : null }}
          onFinish={(v) => onNext(v.quantity, v.neededBy ? v.neededBy.format("YYYY-MM-DD") : null)}
        >
          <Form.Item
            label={
              <span>
                Quantity <InfoTip label="Quantity" title="Check quantity and date. You can change them; the offers stay as quoted." />
              </span>
            }
            name="quantity" rules={[{ required: true, message: "Enter a quantity" }]}>
            <InputNumber<number>
              min={1}
              max={10_000_000}
              precision={0}
              step={1000}
              suffix="pcs"
              style={{ width: "100%" }}
              formatter={(v) => (v === undefined ? "" : Number(v).toLocaleString("en-GB"))}
              parser={(v) => Number((v ?? "").replace(/[^\d]/g, ""))}
            />
          </Form.Item>
          <Form.Item label="Required by" name="neededBy">
            <DatePicker format="D MMM YYYY" disabledDate={(d) => d.isBefore(dayjs(), "day")} style={{ width: "100%" }} />
          </Form.Item>
          <Flex justify="flex-end">
            <Button type="primary" htmlType="submit" disabled={!canRun} icon={<ArrowRightOutlined />} iconPlacement="end">
              Next: collect
            </Button>
          </Flex>
        </Form>
      </Flex>
    </Card>
  );
}
