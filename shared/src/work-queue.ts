import type { AgentRun } from './agent.js';
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

/** Step of a purchase process: 0 Request, 1 Collect, 2 Compare, 3 Decide, 4 Complete. */
export type ProcessStep = 0 | 1 | 2 | 3 | 4;

/** One purchase process started from the work queue (expert interviews, 10 Nov 2026). */
export interface StartedProcess {
  requisition: PurchaseRequisitionRecord;
  quantity: number;
  neededBy: string | null;
  step: ProcessStep;
  reached: ProcessStep;
  run: AgentRun | null;
  record: DecisionRecord | null;
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const asStep = (x: unknown): ProcessStep | null =>
  typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 4 ? (x as ProcessStep) : null;

/**
 * Started processes read back from browser storage after a reload (18 Nov 2026), so "My open requests"
 * survive it. Storage may hold anything, so every entry is checked: broken entries are dropped, and a
 * process whose evidence run does not fit its part goes back to "Collect suppliers" instead of showing
 * a comparison without evidence.
 */
export function restoreStartedProcesses(stored: unknown): Record<string, StartedProcess> {
  if (!isObject(stored)) return {};
  const result: Record<string, StartedProcess> = {};
  for (const [id, value] of Object.entries(stored)) {
    if (!isObject(value) || !isObject(value.requisition)) continue;
    const requisition = value.requisition as unknown as PurchaseRequisitionRecord;
    if (requisition.recordId !== id || typeof requisition.partId !== 'string') continue;
    const step = asStep(value.step);
    const reached = asStep(value.reached);
    const quantity = value.quantity;
    if (step === null || reached === null || step > reached) continue;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) continue;
    const neededBy = typeof value.neededBy === 'string' ? value.neededBy : null;
    const run =
      isObject(value.run) && typeof value.run.runId === 'string' && isObject(value.run.request) && value.run.request.partId === requisition.partId
        ? (value.run as unknown as AgentRun)
        : null;
    const record = run && isObject(value.record) && typeof value.record.recordId === 'string' ? (value.record as unknown as DecisionRecord) : null;
    // Without its evidence a process can only continue at "Collect suppliers".
    const cap = (s: ProcessStep): ProcessStep => (run ? s : (Math.min(s, 1) as ProcessStep));
    result[id] = { requisition, quantity, neededBy, step: cap(step), reached: cap(reached), run, record };
  }
  return result;
}
