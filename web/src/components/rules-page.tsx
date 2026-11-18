"use client";

import { CheckCircleOutlined, LockOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, Form, InputNumber, Switch, Typography } from "antd";
import { useState } from "react";
import { RULE_LIMITS, WEIGHT_DEVIATION_LIMIT, type BuyerRules } from "@scc/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/labels";
import type { DemoUser } from "@/lib/users";
import { PageHeader } from "./page-header";

interface Props {
  rules: BuyerRules;
  user: DemoUser;
  onSaved: (rules: BuyerRules) => void;
}

type Values = Pick<BuyerRules, "priceMaxAgeDays" | "co2MaxAgeDays" | "co2PricePerTonneEur" | "flagEstimatedCo2">;

/** Rules page (Sarah): settings that create warnings for buyers. Fixed rules are shown, not editable. */
export function RulesPage({ rules, user, onSaved }: Props) {
  const [form] = Form.useForm<Values>();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = user.canEditRules;

  const save = async (values: Values) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      // Targets are set on the Targets page; they are saved with the rules, unchanged here.
      const next = await api.saveRules({ ...rules, ...values, updatedBy: `${user.name} (${user.title})` });
      onSaved(next);
      setSaved("Rules saved. Every view now uses them.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await api.resetRules();
      onSaved(next);
      form.setFieldsValue(next);
      setSaved("Rules reset to the defaults.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex vertical gap={12}>
      <PageHeader
        title="Rules for buyers"
        subtitle="Thresholds that add warnings in Fairweigh. They never change the score or the ranking."
        source={
          rules.updatedBy && rules.updatedAt
            ? `Last changed by ${rules.updatedBy}, ${formatDateTime(rules.updatedAt)}`
            : "Defaults of the demo settings, not changed yet"
        }
      />

      <div className="sus-grid">
        <Card className="dash-card" size="small" title="Set by the Scope 3 manager">
          {!editable && (
            <Alert
              type="info"
              showIcon
              icon={<LockOutlined />}
              style={{ marginBottom: 12 }}
              title="Only the Scope 3 manager (Sarah) can change these rules. Switch user in the account menu to try it."
            />
          )}
          <Form<Values>
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={rules}
            disabled={!editable || busy}
            onFinish={save}
          >
            <Form.Item
              label="Warn when a price is older than"
              name="priceMaxAgeDays"
              extra="Old prices are flagged in the matrix; the score does not change."
              rules={[{ required: true, message: "Enter a number of days" }]}
            >
              <InputNumber<number>
                id="rule-price-age"
                min={RULE_LIMITS.priceMaxAgeDays.min}
                max={RULE_LIMITS.priceMaxAgeDays.max}
                precision={0}
                suffix="days"
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item
              label="Warn when CO₂ data is older than"
              name="co2MaxAgeDays"
              extra="Applies in the offer table and on the CO₂ and risks page."
              rules={[{ required: true, message: "Enter a number of days" }]}
            >
              <InputNumber<number>
                id="rule-co2-age"
                min={RULE_LIMITS.co2MaxAgeDays.min}
                max={RULE_LIMITS.co2MaxAgeDays.max}
                precision={0}
                suffix="days"
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item
              label="CO₂ price for the euro display"
              name="co2PricePerTonneEur"
              extra="Shows what CO₂ costs next to the price. Information only, never part of the score."
              rules={[{ required: true, message: "Enter a price per tonne" }]}
            >
              <InputNumber<number>
                id="rule-co2-price"
                min={RULE_LIMITS.co2PricePerTonneEur.min}
                max={RULE_LIMITS.co2PricePerTonneEur.max}
                precision={0}
                suffix="€ per t CO₂e"
                style={{ width: 240 }}
              />
            </Form.Item>
            <Form.Item
              label="Flag offers with estimated CO₂ values"
              name="flagEstimatedCo2"
              valuePropName="checked"
              extra="Adds the note “CO₂ estimated” when a value is not supplier-specific, so buyers ask for real data."
            >
              <Switch id="rule-flag-estimated" />
            </Form.Item>
            {editable && (
              <Flex gap={8}>
                <Button type="primary" htmlType="submit" loading={busy}>
                  Save rules
                </Button>
                <Button onClick={reset} disabled={busy}>
                  Reset to defaults
                </Button>
              </Flex>
            )}
          </Form>
          {saved && <Alert type="success" showIcon style={{ marginTop: 12 }} title={saved} />}
          {error && <Alert type="error" showIcon style={{ marginTop: 12 }} title={error} />}
        </Card>

        <Card className="dash-card" size="small" title="Rules that always apply">
          <Flex vertical gap={10}>
            {[
              "An offer is excluded for a proven legal violation (final fine notice), LkSG risk High without a social audit (SA8000), or a known child or forced labour controversy. Other allegations, medium risk and long lead times are warnings.",
              "A missing or unverified value gets 0 points and a visible note. Gaps never improve an offer.",
              "The ranking is fixed code, not AI: % better or worse than today per criterion, then the weights.",
              `Weights start at the company default of the commodity group. A buyer may move each weight by at most ${WEIGHT_DEVIATION_LIMIT} percentage points and must justify the change in the Decision Log.`,
              "Every value needs a verified source the buyer can open.",
              "CO₂ in euros is shown for information and does not count towards the score.",
            ].map((text) => (
              <Typography.Text key={text}>
                <CheckCircleOutlined /> {text}
              </Typography.Text>
            ))}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              These rules protect buyers from misleading results and cannot be changed. Only the Scope 3 manager can change the rules
              above.
            </Typography.Text>
          </Flex>
        </Card>
      </div>
    </Flex>
  );
}
