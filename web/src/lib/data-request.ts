import { formatDay, isSupplierSpecific, type Criterion, type PcfBadge } from "@scc/shared";

/** What we ask a supplier for, per gap. Plain wording a supplier understands. */
const ASK: Record<Criterion, string> = {
  quality: "Complaint rate for this part over the last 12 months (in % or ppm)",
  price: "A binding price quote with its validity date",
  co2: "Product carbon footprint per piece, cradle-to-gate (ISO 14067 or PACT format), ideally verified by a third party",
  delivery: "On-time delivery rate over the last 12 months",
};

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
}

/** The lines of the request, from the gaps only. Empty when nothing needs asking. */
export function requestItems(i: DataRequestInput): string[] {
  const items = i.missing.map((c) => ASK[c]);
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
