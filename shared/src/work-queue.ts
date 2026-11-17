import type { DecisionRecord } from './decision-record.js';
import type { PurchaseRequisitionRecord } from './sources.js';

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
