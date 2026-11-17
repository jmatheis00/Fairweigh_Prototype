"use client";

import { CalendarOutlined, UndoOutlined } from "@ant-design/icons";
import { Button, DatePicker, Flex, Select, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState, type ReactNode } from "react";
import { addPeriodMonths, monthLabel, previousPeriod, rangePeriod, type Period, type PeriodOptions } from "@scc/shared";

/** What the dashboard pages filter by. The period only applies to purchase figures. */
export interface StatsFilter {
  period: Period;
  /** null = all products. */
  partId: string | null;
}

interface Props {
  options: PeriodOptions;
  value: StatsFilter;
  onChange: (next: StatsFilter) => void;
  /** Products with purchase orders, in catalog order. label: short name; name: full product name. */
  products: { partId: string; label: string; name?: string }[];
  /** Further filters of the page, shown after the product. */
  extra?: ReactNode;
  /** The CPO view filters by commodity group instead of single products (12 Nov 2026). */
  hideProduct?: boolean;
}

const key = (p: Period) => `${p.from}|${p.to}`;
const CUSTOM = "custom";
const CUSTOM_LABEL = "Custom range";
const toMonth = (d: Dayjs) => d.format("YYYY-MM");
const toDay = (month: string) => dayjs(`${month}-01`);
const span = (p: Period) => (p.from === p.to ? monthLabel(p.from) : `${monthLabel(p.from)} – ${monthLabel(p.to)}`);

export function defaultFilter(options: PeriodOptions): StatsFilter {
  return { period: options.latest, partId: null };
}

/** Quick ranges like in common analytics tools, built only from months that have data. */
function quickRanges(options: PeriodOptions): Period[] {
  const last = options.all.to;
  const first = options.all.from;
  const twelve = addPeriodMonths(last, -11);
  const ytd = `${last.slice(0, 4)}-01`;
  return [
    { ...options.latest, label: `Last quarter (${options.latest.label})` },
    { from: twelve < first ? first : twelve, to: last, label: "Last 12 months" },
    { from: ytd < first ? first : ytd, to: last, label: `Year to date ${last.slice(0, 4)}` },
    { ...options.all, label: "All data" },
  ];
}

/** One compact row: period, product, page filters, and what the figures are compared with. */
export function FilterBar({ options, value, onChange, products, extra, hideProduct = false }: Props) {
  const quick = quickRanges(options);
  const groups = [
    { id: "r", label: "Quick ranges", periods: quick },
    { id: "q", label: "Quarters", periods: [...options.quarters].reverse() },
    { id: "m", label: "Months", periods: [...options.months].reverse() },
  ];
  // Option values carry their group, because a quick range can be the same months as a quarter.
  const entries = groups.flatMap((g) => g.periods.map((p) => [`${g.id}:${key(p)}`, p] as const));
  const byKey = new Map<string, Period>(entries);
  const match = entries.find(([, p]) => key(p) === key(value.period) && p.label.includes(value.period.label))?.[0]
    ?? entries.find(([, p]) => key(p) === key(value.period))?.[0];
  const isCustom = match === undefined;
  // Custom range (16 Nov 2026): any span of whole months, but only months that have orders, so it never points at invented data.
  const [picking, setPicking] = useState(false);
  const showPicker = picking || isCustom;
  const selected = isCustom ? CUSTOM : match;
  const isDefault = key(value.period) === key(options.latest) && value.partId === null;
  const before = previousPeriod(value.period);

  return (
    <Flex gap={10} wrap align="center" className="filter-bar" role="group" aria-label="Filters">
      <Select
        size="middle"
        aria-label="Period"
        value={selected}
        onChange={(k: string) => {
          if (k === CUSTOM) {
            setPicking(true);
            return;
          }
          setPicking(false);
          const p = byKey.get(k);
          if (p) onChange({ ...value, period: { from: p.from, to: p.to, label: p.label.replace(/^Last quarter \((.*)\)$/, "$1") } });
        }}
        style={{ width: 290 }}
        prefix={<CalendarOutlined />}
        popupMatchSelectWidth={false}
        labelRender={() =>
          // A custom range shows its months in the picker next to it.
          isCustom ? (
            CUSTOM_LABEL
          ) : (
            <span>
              {value.period.label} <Typography.Text type="secondary">· {span(value.period)}</Typography.Text>
            </span>
          )
        }
        options={groups.map((g) => ({
          label: g.label,
          options: [
            ...g.periods.map((p) => ({
              value: `${g.id}:${key(p)}`,
              label: (
                <span>
                  {p.label} <Typography.Text type="secondary">· {span(p)}</Typography.Text>
                </span>
              ),
            })),
            ...(g.id === "r" ? [{ value: CUSTOM, label: <span>{CUSTOM_LABEL}…</span> }] : []),
          ],
        }))}
      />
      {showPicker && (
        <DatePicker.RangePicker
          picker="month"
          size="middle"
          aria-label="Custom range"
          format="MMM YYYY"
          allowClear={false}
          autoFocus={picking && !isCustom}
          defaultOpen={picking && !isCustom}
          value={[toDay(value.period.from), toDay(value.period.to)]}
          minDate={toDay(options.all.from)}
          maxDate={toDay(options.all.to)}
          onOpenChange={(open) => {
            if (!open) setPicking(false);
          }}
          onChange={(range) => {
            const [from, to] = range ?? [];
            if (from && to) onChange({ ...value, period: rangePeriod(toMonth(from), toMonth(to)) });
            setPicking(false);
          }}
          style={{ width: 220 }}
        />
      )}
      {!hideProduct && (
      <Select
        size="middle"
        aria-label="Product"
        value={value.partId ?? "all"}
        onChange={(v: string) => onChange({ ...value, partId: v === "all" ? null : v })}
        style={{ width: 210 }}
        popupMatchSelectWidth={false}
        options={[{ value: "all", label: "All products" }, ...products.map((p) => ({ value: p.partId, label: p.name ?? p.label }))]}
        labelRender={(o) => (o.value === "all" ? "All products" : (products.find((p) => p.partId === o.value)?.label ?? String(o.label)))}
      />
      )}
      {extra}
      <Flex gap={8} align="center" style={{ marginLeft: "auto" }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Compared with {before.label}
        </Typography.Text>
        {!isDefault && (
          <Button size="small" type="link" icon={<UndoOutlined />} onClick={() => {
              setPicking(false);
              onChange(defaultFilter(options));
            }}>
            Reset
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
