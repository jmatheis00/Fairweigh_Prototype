import type { DecisionRecord } from './decision-record.js';
import type { CatalogPart, PurchaseRequisitionRecord } from './sources.js';

/**
 * Work queue on the start page (expert interviews, decision of 10 Nov 2026).
 * Pure code: the ERP holds the open requisitions, the cockpit knows which ones
 * it has started and which ones have a recorded decision.
 */
export type RequisitionStatus = 'open' | 'in progress' | 'decided';

export interface QueueEntry {
  requisition: PurchaseRequisitionRecord;
  status: RequisitionStatus;
  /** The decision that completed the requisition, if any. */
  decision: DecisionRecord | null;
}

/** Status per requisition: decided if a decision names it, in progress if the cockpit started it. */
export function workQueue(
  requisitions: PurchaseRequisitionRecord[],
  decisions: DecisionRecord[],
  startedRequisitionIds: ReadonlySet<string>,
): QueueEntry[] {
  return requisitions.map((requisition) => {
    const decision = [...decisions].reverse().find((d) => d.requisitionId === requisition.recordId) ?? null;
    const started = startedRequisitionIds.has(requisition.recordId) || requisition.status === 'in progress';
    const status: RequisitionStatus = decision ? 'decided' : started ? 'in progress' : 'open';
    return { requisition, status, decision };
  });
}

/** What the buyer enters to add a requisition by hand (18 Nov 2026). */
export interface ManualRequisitionInput {
  partId: string;
  quantity: number;
  neededBy: string;
  requestedBy: string;
}

/**
 * A requisition the buyer adds by hand, for a part of the catalog that has offers (18 Nov 2026).
 * It gets the next free number "PR-M-0001", "PR-M-0002", ... and is marked as manual, so it is never
 * mistaken for one from the ERP. Returns null for an unknown part, a part without offers or a quantity below 1.
 */
export function manualRequisition(
  input: ManualRequisitionInput,
  catalog: Pick<CatalogPart, 'partId' | 'partName' | 'category' | 'hasOffers'>[],
  existingIds: readonly string[],
  buyer: string,
  today: string,
): PurchaseRequisitionRecord | null {
  const part = catalog.find((p) => p.partId === input.partId && p.hasOffers);
  if (!part || !Number.isFinite(input.quantity) || input.quantity < 1) return null;
  const used = existingIds.map((id) => /^PR-M-(\d+)$/.exec(id)?.[1]).filter((n): n is string => !!n).map(Number);
  const next = (used.length > 0 ? Math.max(...used) : 0) + 1;
  return {
    recordId: `PR-M-${String(next).padStart(4, '0')}`,
    system: 'erp',
    notice: 'Added manually in Fairweigh',
    partId: part.partId,
    partName: part.partName,
    category: part.category,
    quantity: Math.round(input.quantity),
    neededBy: input.neededBy,
    createdOn: today,
    requestedBy: input.requestedBy.trim() || 'Not stated',
    buyer,
    status: 'open',
    origin: 'manual',
  };
}
