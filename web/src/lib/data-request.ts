import { formatDay, isSupplierSpecific, type AgentRun, type Criterion, type DecisionResult, type PcfBadge } from "@scc/shared";

/** What we ask a supplier for, per gap. Plain wording a supplier understands. */
const ASK: Record<Criterion, string> = {
  quality: "Complaint rate for this part over the last 12 months (in % or ppm)",
  price: "A binding price quote with its validity date",
  co2: "Product carbon footprint per piece, cradle-to-gate (ISO 14067 or PACT format), ideally verified by a third party",
  delivery: "On-time delivery rate over the last 12 months",
};

const SAMPLE =
  "A sample delivery of this part (quantity by agreement), so our incoming inspection can rate quality and on-time delivery";
const SOCIAL_AUDIT =
  "A valid social audit certificate (SA8000) for the production site. The production country is rated high risk under the German Supply Chain Act (LkSG), so we can only consider the offer with this audit";

export interface DataRequestInput {
  supplierName: string;
  partName: string;
  quantity: number;
  neededBy: string | null;
  /** Criteria without a verified value. */
  missing: Criterion[];
  /** Warnings of the offer, e.g. "Price outdated (120 days)". */
  warnings: string[];
  /** Data-quality level of a verified CO₂ value, or null. */
  co2Badge: PcfBadge | null;
  /** The supplier never delivered to us, so quality and delivery can only come from a sample delivery. */
  neverDelivered?: boolean;
  /** Excluded for LkSG risk High without a social audit: a valid SA8000 audit would lift the knock-out. */
  lksgExcluded?: boolean;
}

/** The data request for one offer of a run: its gaps, warnings and CO₂ data quality. */
export function offerDataRequest(
  run: AgentRun,
  result: DecisionResult,
  supplierId: string,
  supplierName: string,
  partName: string,
  neverDelivered = false,
): DataRequestInput {
  const ranked = result.ranked.find((r) => r.supplierId === supplierId);
  const excluded = result.excluded.find((x) => x.supplierId === supplierId);
  // Excluded offers have no score, so their gaps come from the run.
  const missing = ranked?.missing ?? (excluded ? [...new Set(run.gaps.filter((g) => g.supplierId === supplierId).map((g) => g.topic))].filter(isCriterion) : []);
  return {
    supplierName,
    partName,
    quantity: run.request.quantity,
    neededBy: run.request.neededBy,
    missing,
    warnings: ranked?.warnings ?? [],
    co2Badge: run.evidence.find((e) => e.supplierId === supplierId && e.topic === "co2" && e.status === "verified")?.sourceBadge ?? null,
    neverDelivered,
    lksgExcluded: excluded?.knockOut.reason.startsWith("LkSG") ?? false,
  };
}

const isCriterion = (t: string): t is Criterion => t === "quality" || t === "price" || t === "co2" || t === "delivery";

/** The lines of the request, from the gaps only. Empty when nothing needs asking. */
export function requestItems(i: DataRequestInput): string[] {
  // An offer excluded for LkSG only needs the audit first; everything else is asked once it is back in (19 Nov 2026).
  if (i.lksgExcluded) return [SOCIAL_AUDIT];
  // Quality and delivery are our own ERP figures from real deliveries (19 Nov 2026): a supplier's own rate could not be
  // verified, so a supplier that never delivered is asked for a sample delivery instead. For one that did deliver, a gap
  // there is an internal matter and not asked of the supplier.
  const items = i.missing.filter((c) => c === "price" || c === "co2").map((c) => ASK[c]);
  if (i.neverDelivered && (i.missing.includes("quality") || i.missing.includes("delivery"))) {
    items.unshift(SAMPLE);
  }
  const co2Asked = i.missing.includes("co2");
  if (!co2Asked && i.co2Badge && !isSupplierSpecific(i.co2Badge)) items.push(`${ASK.co2}; we only have an estimate so far`);
  else if (!co2Asked && i.warnings.some((w) => w.startsWith("CO₂") && /outdated/i.test(w))) items.push("A current product carbon footprint per piece; the one we have is outdated");
  if (!i.missing.includes("price")) {
    if (i.warnings.some((w) => /^Indicative/i.test(w))) items.push("A binding quote instead of the indicative price");
    else if (i.warnings.some((w) => w.startsWith("Price") && /outdated/i.test(w))) items.push("An updated price quote; the one we have is outdated");
  }
  if (i.warnings.some((w) => /Lead time not verified/.test(w))) items.push("A confirmed lead time for this quantity");
  return items;
}

/**
 * Turns a request text ("Subject: …", blank line, body) into a prefilled e-mail draft for the buyer's own mail
 * program, like "Request current price" (18 Nov 2026). Nothing is sent and no recipient is filled in, because the
 * systems hold no supplier contact.
 */
export function requestMailto(text: string): string {
  const [first, ...rest] = text.split("\n");
  const subject = first.replace(/^Subject:\s*/, "");
  const body = rest.join("\n").replace(/^\n+/, "");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Subject and body of a data request, opened as an e-mail draft in the buyer's own mail program. Nothing is sent. */
export function dataRequestText(i: DataRequestInput): string {
  const items = requestItems(i);
  const due = i.neededBy ? `, needed by ${formatDay(i.neededBy)}` : "";
  return [
    `Subject: Data for your offer: ${i.partName}`,
    "",
    `Dear ${i.supplierName} team,`,
    "",
    `we are comparing offers for ${i.partName} (${i.quantity.toLocaleString("en-GB")} pcs${due}). To assess your offer fairly, please send us:`,
    "",
    ...items.map((t) => `- ${t}`),
    "",
    "Please add the source for every value (data sheet, certificate or system export). Values without a source cannot be taken into account.",
    "",
    "Kind regards",
  ].join("\n");
}

/** A sustainability data request for the Scope 3 manager (not tied to an offer). Nothing is sent. */
export function sustainabilityRequestText(supplierName: string, items: string[]): string {
  return [
    "Subject: Sustainability data for our supplier evaluation",
    "",
    `Dear ${supplierName} team,`,
    "",
    "for our Scope 3 reporting and supplier evaluation, please send us:",
    "",
    ...items.map((t) => `- ${t}`),
    "",
    "Please add the source for every value (report, certificate, data sheet or system export).",
    "",
    "Kind regards",
  ].join("\n");
}
