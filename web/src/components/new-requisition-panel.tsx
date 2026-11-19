"use client";

import dayjs, { type Dayjs } from "dayjs";
import { PlusOutlined } from "@ant-design/icons";
import { Alert, AutoComplete, Button, DatePicker, Flex, Form, InputNumber, Select, Typography } from "antd";
import type { CatalogPart, ManualRequisitionInput, PurchaseRequisitionRecord } from "@scc/shared";
import { useState } from "react";
import { SidePanel } from "./side-panel";

interface Values {
  partId: string;
  quantity: number;
  neededBy: Dayjs;
  requestedBy: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: CatalogPart[];
  /** Plants and lines of the existing requisitions, offered as suggestions. */
  plants: string[];
  onAdd: (input: ManualRequisitionInput) => PurchaseRequisitionRecord | null;
}

/**
 * Side panel to add a requisition by hand (18 Nov 2026): for a material that is not in the ERP queue yet,
 * or to check it in the cockpit. Only parts with offers in the demo data can be chosen.
 */
export function NewRequisitionPanel({ open, onClose, catalog, plants, onAdd }: Props) {
  const [form] = Form.useForm<Values>();
  const [failed, setFailed] = useState(false);
  const parts = catalog.filter((p) => p.hasOffers);

  const close = () => {
    setFailed(false);
    onClose();
  };

  const submit = (v: Values) => {
    const created = onAdd({
      partId: v.partId,
      quantity: v.quantity,
      neededBy: v.neededBy.format("YYYY-MM-DD"),
      requestedBy: v.requestedBy ?? "",
    });
    if (!created) return setFailed(true);
    close();
  };

  return (
    <SidePanel open={open} onClose={close} size={420} title="New requisition"
      destroyOnHidden
      // Empty the form only once the panel is closed, so it does not flash empty while closing.
      afterOpenChange={(isOpen) => {
        if (!isOpen) form.resetFields();
      }}
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary">
          Add a material that is not in the ERP queue yet. It appears under &quot;To procure&quot; marked as Manual, and you
          start it like any other requisition. The order is still created in the ERP after the decision.
        </Typography.Text>
        {failed && <Alert type="error" showIcon title="The requisition could not be added. Check material and quantity." />}
        <Form<Values>
          form={form}
          layout="vertical"
          requiredMark={false}
          initialValues={{ neededBy: dayjs().add(6, "week"), requestedBy: plants[0] ?? "" }}
          onValuesChange={(changed: Partial<Values>) => {
            // Suggest the usual quantity of the chosen material.
            if (changed.partId) {
              const part = parts.find((p) => p.partId === changed.partId);
              if (part?.defaultQuantity) form.setFieldValue("quantity", part.defaultQuantity);
            }
          }}
          onFinish={submit}
        >
          <Form.Item label="Material" name="partId" rules={[{ required: true, message: "Choose a material" }]} extra="Materials with offers from our suppliers">
            <Select
              placeholder="Choose a material"
              showSearch={{ optionFilterProp: "label" }}
              options={parts.map((p) => ({ value: p.partId, label: `${p.partName} (${p.category})` }))}
            />
          </Form.Item>
          <Form.Item label="Quantity" name="quantity" rules={[{ required: true, message: "Enter a quantity" }]}>
            <InputNumber<number>
              min={1}
              max={10_000_000}
              precision={0}
              step={100}
              suffix="pcs"
              style={{ width: "100%" }}
              formatter={(v) => (v === undefined ? "" : Number(v).toLocaleString("en-GB"))}
              parser={(v) => Number((v ?? "").replace(/[^\d]/g, ""))}
            />
          </Form.Item>
          <Form.Item label="Required by" name="neededBy" rules={[{ required: true, message: "Choose a date" }]}>
            <DatePicker format="D MMM YYYY" disabledDate={(d) => d.isBefore(dayjs(), "day")} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item label="Requested by" name="requestedBy">
            <AutoComplete options={plants.map((p) => ({ value: p }))} placeholder="Plant or line" />
          </Form.Item>
          <Flex justify="flex-end" gap={8}>
            <Button onClick={close}>Cancel</Button>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
              Add to queue
            </Button>
          </Flex>
        </Form>
      </Flex>
    </SidePanel>
  );
}
