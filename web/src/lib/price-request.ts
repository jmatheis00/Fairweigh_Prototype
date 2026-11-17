import { formatDay, verifiedEvidence, type AgentRun } from "@scc/shared";
import { formatEur } from "./labels";

/**
 * "Request current price" (16 Nov 2026): a prefilled e-mail to the supplier, built only from the request and the
 * verified quoted price. The buyer's mail program opens with it; the cockpit sends and tracks nothing. No recipient
 * is filled in, because the systems hold no supplier contact.
 */
export function priceRequestMailto(run: AgentRun, supplierId: string, supplierName: string, partName: string): string {
  const { quantity, neededBy, partId } = run.request;
  const price = verifiedEvidence(run, supplierId, "price");
  const subject = `Request for a current price: ${partName} (${partId})`;
  const lines = [
    `Dear ${supplierName} team,`,
    "",
    "please send us a current, binding price for:",
    "",
    `Part: ${partName} (${partId})`,
    `Quantity: ${quantity.toLocaleString("en-GB")} pcs`,
    ...(neededBy ? [`Needed by: ${formatDay(neededBy)}`] : []),
    ...(typeof price?.value === "number"
      ? [`Your last quotation: ${formatEur(price.value, 2)} per piece${price.sourceDate ? `, dated ${formatDay(price.sourceDate)}` : ""}`]
      : []),
    "",
    "Please include the lead time and the validity of the offer.",
    "",
    "Best regards",
  ];
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
