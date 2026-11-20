import {
  withAssumedValues,
  buildDecisionInput,
  buildDecisionRecord,
  decide,
  type AgentRun,
  type DecisionRecord,
  type DemoDataset,
  type Evidence,
} from '@scc/shared';
import type { Assumptions } from './assumptions.ts';
import { unitPriceFromIndex } from './build-dataset.ts';

const n = (v: number, d: number) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

/** The reason in words, from the chosen offer and the replaced supplier's records (same price rule as the purchase orders). */
function generatedReason(dataset: DemoDataset, assumptions: Assumptions, partId: string, chosenId: string, replacedId: string): string {
  const part = assumptions.parts.find((p) => p.partId === partId)!;
  const offer = dataset.offers.find((o) => o.partId === partId && o.supplierId === chosenId);
  const newPcf = dataset.pcf.find((p) => p.partId === partId && p.supplierId === chosenId);
  const oldPcf = dataset.pcf.find((p) => p.partId === partId && p.supplierId === replacedId);
  const oldErp = dataset.erp.find((e) => e.supplierId === replacedId);
  if (!offer || !newPcf || !oldPcf || oldErp?.priceIndex == null) {
    throw new Error(`Example decision ${partId}: records for ${chosenId} or ${replacedId} missing`);
  }
  const oldPrice = unitPriceFromIndex(part.basePriceEurAtIndex100.value, oldErp.priceIndex);
  const change = ((offer.unitPriceEur - oldPrice) / oldPrice) * 100;
  // In words, never with a + or − sign (20 Nov 2026), and with the supplier's name instead of its ID.
  const pct = Math.abs(change) < 0.05 ? 'same price' : `${n(Math.abs(change), 1)} % ${change > 0 ? 'more expensive' : 'cheaper'}`;
  return (
    `Switch from ${oldErp.supplierName}: ${n(newPcf.pcfKgPerPiece, 1)} instead of ${n(oldPcf.pcfKgPerPiece, 1)} kg CO₂e per piece ` +
    `(${newPcf.badge === oldPcf.badge ? `both ${newPcf.badge.toLowerCase()}` : `${newPcf.badge.toLowerCase()} vs ${oldPcf.badge.toLowerCase()}`}) at ${n(offer.unitPriceEur, 2)} € instead of ${n(oldPrice, 2)} € (${pct}).`
  );
}

/**
 * Example decisions for the decision log (6 Nov 2026). They show how a
 * recorded decision looks, without an AI run: the evidence is read field by
 * field from the demo records, so every value stands at its source by
 * construction. Ranking and record come from the same shared code as a real
 * decision (decide, buildDecisionRecord). Mode "example" marks them.
 */

function evidenceFor(dataset: DemoDataset, partId: string, supplierId: string, at: string): Evidence[] {
  const out: Evidence[] = [];
  const base = {
    supplierId,
    sentence: 'Read from the demo record for the example decision.',
    retrievedAt: at,
    status: 'verified' as const,
    checkFailures: [],
  };
  const add = (e: Omit<Evidence, keyof typeof base | 'evidenceId'>) =>
    out.push({ ...base, ...e, evidenceId: `EX-${supplierId}-${partId}-${out.length + 1}` });

  const erp = dataset.erp.find((r) => r.supplierId === supplierId);
  if (erp?.complaintRatePercent != null) {
    add({ topic: 'quality', value: erp.complaintRatePercent, unit: '%', system: 'erp', recordId: erp.recordId, location: { kind: 'field', field: 'complaintRatePercent' }, sourceDocumentType: null, sourceDate: erp.lastUpdated, sourceBadge: null });
  }
  if (erp?.onTimeDeliveryPercent != null) {
    add({ topic: 'delivery', value: erp.onTimeDeliveryPercent, unit: '%', system: 'erp', recordId: erp.recordId, location: { kind: 'field', field: 'onTimeDeliveryPercent' }, sourceDocumentType: null, sourceDate: erp.lastUpdated, sourceBadge: null });
  }
  const offer = dataset.offers.find((o) => o.supplierId === supplierId && o.partId === partId);
  const doc = offer && dataset.documents.find((d) => d.documentId === offer.sourceDocumentId);
  const line = (prefix: string) => doc?.pages[0]?.lines.find((l) => l.startsWith(prefix));
  const priceLine = line('Unit price:');
  if (offer && doc && priceLine) {
    add({ topic: 'price', value: offer.unitPriceEur, unit: 'EUR/piece', system: 'documents', recordId: doc.documentId, location: { kind: 'document', page: 1, quote: priceLine }, sourceDocumentType: 'offer', sourceDate: doc.issuedOn, sourceBadge: null });
  }
  const leadLine = line('Lead time:');
  if (offer?.leadTimeDays != null && doc && leadLine) {
    add({ topic: 'leadTime', value: offer.leadTimeDays, unit: 'days', system: 'documents', recordId: doc.documentId, location: { kind: 'document', page: 1, quote: leadLine }, sourceDocumentType: 'offer', sourceDate: doc.issuedOn, sourceBadge: null });
  }
  const pcf = dataset.pcf.find((p) => p.supplierId === supplierId && p.partId === partId);
  if (pcf) {
    add({ topic: 'co2', value: pcf.pcfKgPerPiece, unit: 'kg CO2e/piece', system: 'pcf', recordId: pcf.recordId, location: { kind: 'field', field: 'pcfKgPerPiece' }, sourceDocumentType: null, sourceDate: pcf.referenceDate, sourceBadge: pcf.badge });
  }
  const rating = dataset.ratings.find((r) => r.supplierId === supplierId);
  if (rating?.lksgCountryRisk === 'High') {
    add({ topic: 'compliance', value: 'High', unit: 'text', system: 'ratings', recordId: rating.recordId, location: { kind: 'field', field: 'lksgCountryRisk' }, sourceDocumentType: null, sourceDate: rating.lastUpdated, sourceBadge: null, socialAudit: /\bSA8000\b/.test(rating.certifications ?? '') });
  }
  if (rating?.controversies && rating.controversies !== 'None known') {
    add({ topic: 'compliance', value: rating.controversies, unit: 'text', system: 'ratings', recordId: rating.recordId, location: { kind: 'field', field: 'controversies' }, sourceDocumentType: null, sourceDate: rating.lastUpdated, sourceBadge: null, socialAudit: /\bSA8000\b/.test(rating.certifications ?? '') });
  }
  return out;
}

export function buildExampleDecisions(dataset: DemoDataset, assumptions: Assumptions): DecisionRecord[] {
  return (assumptions.exampleDecisions?.decisions ?? []).map((example) => {
    const supplierIds = dataset.offers.filter((o) => o.partId === example.partId).map((o) => o.supplierId);
    if (supplierIds.length === 0) throw new Error(`${example.decisionId}: no offers for ${example.partId}`);
    const run: AgentRun = {
      runId: `EXAMPLE-${example.decisionId}`,
      request: { partId: example.partId, supplierIds, quantity: example.quantity, neededBy: null },
      mode: { kind: 'example' },
      status: 'completed',
      startedAt: example.recordedAt,
      finishedAt: example.recordedAt,
      steps: [],
      evidence: supplierIds.flatMap((id) => evidenceFor(dataset, example.partId, id, example.recordedAt)),
      gaps: [],
      error: null,
    };
    const input = buildDecisionInput(run, {
      today: example.recordedAt.slice(0, 10),
      priceMaxAgeDays: dataset.settings.priceMaxAgeDays,
      co2MaxAgeDays: dataset.settings.co2MaxAgeDays,
    });
    const catalogPart = dataset.settings.catalog.find((c) => c.partId === example.partId);
    const neverDelivered = new Set(
      dataset.erp.filter((e) => e.relationshipStatus === 'Quote only' || e.relationshipStatus === 'New - found by AI agent').map((e) => e.supplierId),
    );
    const offers = withAssumedValues(input, catalogPart?.newSupplierAssumption ?? null, neverDelivered);
    const result = decide(offers, example.weights, catalogPart?.benchmarks ?? null);
    return buildDecisionRecord({
      run,
      result,
      weights: example.weights,
      chosenSupplierId: example.chosenSupplierId,
      reason: generatedReason(dataset, assumptions, example.partId, example.chosenSupplierId, example.replacedSupplierId),
      recordId: example.decisionId,
      requisitionId: example.requisitionId ?? null,
      recordedAt: example.recordedAt,
      decidedBy: example.decidedBy,
      reference: catalogPart?.benchmarks ?? null,
    });
  });
}
