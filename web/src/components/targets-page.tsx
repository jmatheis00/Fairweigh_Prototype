"use client";

import { CheckCircleOutlined, ClockCircleOutlined, EyeInvisibleOutlined, FilePdfOutlined, LockOutlined, MailOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Flex, InputNumber, Progress, Segmented, Switch, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { MAX_TARGET_TONNES, targetOverview, type BuyerProfile, type BuyerRules, type Co2Targets, type TargetRow, type TargetStatus } from "@scc/shared";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/labels";
import type { DemoUser } from "@/lib/users";
import { useIsPhone } from "@/lib/use-phone";
import { InfoTip } from "./info-tip";
import { PageHeader } from "./page-header";
import { TargetsPrintReport } from "./targets-print-report";
import { BRAND } from "@/lib/theme";

interface Props {
  rules: BuyerRules;
  /** Everything targetOverview needs except the targets, which come from the draft here. */
  inputs: Omit<Parameters<typeof targetOverview>[0], "targets" | "buyers">;
  buyers: BuyerProfile[];
  user: DemoUser;
  onSaved: (rules: BuyerRules) => void;
}

/** Status as icon plus word, never colour alone. */
export function TargetStatusTag({ status }: { status: TargetStatus }) {
  if (status === "achieved") return <Tag color="success" icon={<CheckCircleOutlined />} style={{ marginInlineEnd: 0 }}>Achieved</Tag>;
  if (status === "on track") return <Tag icon={<ClockCircleOutlined />} style={{ marginInlineEnd: 0 }}>On track</Tag>;
  return <Tag color="warning" icon={<WarningOutlined />} style={{ marginInlineEnd: 0 }}>At risk</Tag>;
}

const t = (n: number) => `${formatNumber(n, 1)} t`;

const STATUS_TEXT: Record<TargetStatus, string> = { achieved: "achieved", "on track": "on track", "at risk": "at risk" };

/** Prefilled mail for one buyer. The cockpit sends and tracks nothing; the mail client opens with this text. */
export function buyerMailto(r: TargetRow, email: string, showAchievement: boolean): string {
  const subject = `CO₂ target 2026: ${r.related.length ? r.related.join(", ") : r.key}`;
  const lines = [`Hello ${r.key},`, "", `Your CO₂ target for 2026: ${formatNumber(r.targetTonnes, 0)} t CO₂e`];
  if (showAchievement) {
    lines.push(
      `Achieved so far: ${formatNumber(r.achievedTonnes, 1)} t CO₂e`,
      `Remaining: ${formatNumber(r.remainingTonnes, 1)} t CO₂e`,
      `Status: ${STATUS_TEXT[r.status]}`,
    );
  }
  lines.push("", "Best regards", "Sarah");
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

/** Sarah's targets (expert interviews, 10 Nov 2026): company, buyers and commodity groups, with achievement. */
export function TargetsPage({ rules, inputs, buyers, user, onSaved }: Props) {
  const editable = user.canEditRules;
  const canContact = user.role === "scope3-manager";
  const isPhone = useIsPhone();
  const [draft, setDraft] = useState<Co2Targets>(rules.co2Targets);
  const [showBuyers, setShowBuyers] = useState(rules.showBuyerTargets);
  const [view, setView] = useState<"buyer" | "group">("buyer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Status and progress follow the targets as they are typed, before saving.
  const overview = useMemo(() => targetOverview({ ...inputs, buyers, targets: draft }), [inputs, buyers, draft]);
  const changed = JSON.stringify(draft) !== JSON.stringify(rules.co2Targets) || showBuyers !== rules.showBuyerTargets;
  const elapsed = Math.round(overview.yearElapsed * 100);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.saveRules({ ...rules, co2Targets: draft, showBuyerTargets: showBuyers, updatedBy: `${user.name} (${user.title})` });
      onSaved(next);
      setMessage({ type: "success", text: "Targets saved. Each buyer sees their own target on the work queue." });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const targetInput = (value: number, onChange: (v: number) => void, label: string, min = 0) =>
    editable ? (
      <InputNumber<number>
        size="small"
        min={min}
        max={MAX_TARGET_TONNES}
        precision={0}
        suffix="t"
        value={value}
        onChange={(v) => v !== null && onChange(v)}
        aria-label={`CO₂ target of ${label} in tonnes`}
        style={{ width: 110 }}
      />
    ) : (
      `${formatNumber(value, 0)} t`
    );

  const hidden = view === "buyer" && !showBuyers;
  const rows = view === "buyer" ? overview.byBuyer : overview.byGroup;
  const title = (r: TargetRow) => (view === "buyer" ? buyers.find((b) => b.name === r.key)?.title : null);
  const hiddenCell = (
    <Typography.Text type="secondary">
      <EyeInvisibleOutlined /> Hidden
    </Typography.Text>
  );

  const source =
    rules.updatedBy && rules.updatedAt ? `Last changed by ${rules.updatedBy}, ${formatDateTime(rules.updatedAt)}` : "Default targets, not changed yet";

  return (
    <>
    <Flex vertical gap={12} className="targets-report screen-only">
      <Flex gap={12} align="flex-end" justify="space-between" wrap>
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
      <PageHeader
        title={`CO₂ targets ${overview.year}`}
        subtitle="How much CO₂ the company, each buyer and each commodity group should avoid this year, and how far they are."
        source={source}
      />
        </div>
        <Button className="no-print" icon={<FilePdfOutlined />} onClick={() => window.print()}>
          Export report
        </Button>
      </Flex>
      {!editable && (
        <Alert type="info" showIcon icon={<LockOutlined />} title="Only the Scope 3 manager (Sarah) sets the targets." />
      )}

      <Card
        className="dash-card"
        size="small"
        title={
          <span>
            Company target{" "}
            <InfoTip
              label="the company target"
              title="Avoided CO₂ = CO₂ of the replaced supplier minus CO₂ of the chosen one, times the quantity: from orders after Fairweigh decisions this year, plus decisions not ordered yet."
            />
          </span>
        }
        extra={<TargetStatusTag status={overview.company.status} />}
      >
        <Flex gap={24} align="center" wrap>
          <Flex vertical gap={4} style={{ flex: "1 1 300px", minWidth: 0 }}>
            <Typography.Text>
              <strong>{t(overview.company.achievedTonnes)}</strong> of {formatNumber(draft.company, 0)} t CO₂e avoided ({overview.company.percent} %) ·{" "}
              {t(overview.company.remainingTonnes)} remaining
            </Typography.Text>
            <Progress
              percent={overview.company.percent}
              showInfo={false}
              strokeColor={BRAND.primary}
              aria-label={`${overview.company.percent} % of the company target achieved`}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {elapsed} % of {overview.year} has passed. “On track” means at least {elapsed} % of the target is achieved.
            </Typography.Text>
          </Flex>
          <Flex vertical gap={4}>
            <Typography.Text type="secondary">Target for {overview.year}</Typography.Text>
            {targetInput(draft.company, (v) => setDraft({ ...draft, company: v }), "the company", 1)}
          </Flex>
        </Flex>
      </Card>

      <Card
        className="dash-card"
        size="small"
        title={
          <Segmented
            value={view}
            onChange={(v) => setView(v as "buyer" | "group")}
            options={[
              { value: "buyer", label: "By buyer" },
              { value: "group", label: "By commodity group" },
            ]}
          />
        }
        extra={
          <Flex align="center" gap={8}>
            <Switch
              id="show-buyer-targets"
              size="small"
              checked={showBuyers}
              disabled={!editable}
              onChange={setShowBuyers}
            />
            <label htmlFor="show-buyer-targets" style={{ fontSize: 13 }}>
              Show achievement per buyer
            </label>
            <InfoTip
              label="showing achievement per buyer"
              title="A company setting, because personal targets can affect bonus talks. When off, only targets are shown per buyer; each buyer still sees their own progress."
            />
          </Flex>
        }
        styles={{ body: { padding: 0 } }}
      >
        {isPhone ? (
          // Phones: one card per buyer or commodity group instead of a six-column table.
          <Flex vertical gap={8} style={{ padding: 12 }}>
            {rows.map((r) => (
              <div key={r.key} className="queue-item">
                <Flex justify="space-between" align="flex-start" gap={8}>
                  <Flex vertical style={{ minWidth: 0 }}>
                    <Typography.Text strong>{r.key}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {view === "buyer" ? r.related.join(", ") : `Buyer: ${r.related.join(", ") || "none"}`}
                    </Typography.Text>
                  </Flex>
                  {!hidden && <TargetStatusTag status={r.status} />}
                </Flex>
                <Flex justify="space-between" align="center" gap={8} style={{ marginTop: 8 }}>
                  <Typography.Text type="secondary">Target</Typography.Text>
                  {view === "buyer"
                    ? targetInput(draft.buyers[r.key] ?? 0, (v) => setDraft({ ...draft, buyers: { ...draft.buyers, [r.key]: v } }), r.key)
                    : targetInput(draft.groups[r.key] ?? 0, (v) => setDraft({ ...draft, groups: { ...draft.groups, [r.key]: v } }), r.key)}
                </Flex>
                {hidden ? (
                  <div style={{ marginTop: 6 }}>{hiddenCell}</div>
                ) : (
                  <>
                    <Progress percent={r.percent} size="small" strokeColor={BRAND.primary} aria-label={`${r.percent} % achieved`} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t(r.achievedTonnes)} achieved · {t(r.remainingTonnes)} remaining
                    </Typography.Text>
                  </>
                )}
              </div>
            ))}
          </Flex>
        ) : (
        <Table<TargetRow>
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: view === "buyer" ? "Buyer" : "Commodity group",
              key: "name",
              render: (_, r) => (
                <Flex vertical>
                  <Typography.Text strong>{r.key}</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {view === "buyer" ? `${title(r) ?? ""} · ${r.related.join(", ")}` : `Buyer: ${r.related.join(", ") || "none"}`}
                  </Typography.Text>
                </Flex>
              ),
            },
            {
              title: "Target",
              key: "target",
              width: 130,
              align: "right",
              render: (_, r) =>
                view === "buyer"
                  ? targetInput(draft.buyers[r.key] ?? 0, (v) => setDraft({ ...draft, buyers: { ...draft.buyers, [r.key]: v } }), r.key)
                  : targetInput(draft.groups[r.key] ?? 0, (v) => setDraft({ ...draft, groups: { ...draft.groups, [r.key]: v } }), r.key),
            },
            { title: "Achieved", key: "ach", width: 110, align: "right", render: (_, r) => (hidden ? hiddenCell : t(r.achievedTonnes)) },
            { title: "Remaining", key: "rem", width: 110, align: "right", render: (_, r) => (hidden ? hiddenCell : t(r.remainingTonnes)) },
            {
              title: "Progress",
              key: "bar",
              width: 200,
              render: (_, r) => (hidden ? hiddenCell : <Progress percent={r.percent} size="small" strokeColor={BRAND.primary} aria-label={`${r.percent} % achieved`} />),
            },
            { title: "Status", key: "status", width: 120, render: (_, r) => (hidden ? hiddenCell : <TargetStatusTag status={r.status} />) },
            ...(canContact && view === "buyer"
              ? [
                  {
                    title: "Contact",
                    key: "contact",
                    width: 100,
                    className: "no-print",
                    render: (_: unknown, r: TargetRow) => {
                      const email = buyers.find((b) => b.name === r.key)?.email;
                      return email ? (
                        <Button type="link" size="small" icon={<MailOutlined />} href={buyerMailto(r, email, showBuyers)} style={{ paddingInline: 0 }}>
                          Contact
                        </Button>
                      ) : null;
                    },
                  },
                ]
              : []),
          ]}
        />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", padding: "8px 12px 10px" }}>
          Achievement counts the commodity groups a buyer is responsible for. Changed targets count from now on and appear on the buyer&apos;s
          work queue.
        </Typography.Text>
      </Card>

      {editable && (
        <Flex gap={8}>
          <Button type="primary" onClick={save} loading={busy} disabled={!changed}>
            Save targets
          </Button>
          <Button
            disabled={!changed || busy}
            onClick={() => {
              setDraft(rules.co2Targets);
              setShowBuyers(rules.showBuyerTargets);
            }}
          >
            Undo changes
          </Button>
        </Flex>
      )}
      {message && <Alert type={message.type} showIcon title={message.text} />}
    </Flex>
    <TargetsPrintReport overview={overview} showBuyers={showBuyers} source={source} />
    </>
  );
}
