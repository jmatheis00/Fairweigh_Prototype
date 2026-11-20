import { checkWeightLimits, weightsDeviate } from './weights.js';
import type { AgentRun, EvidenceStatus, EvidenceTopic } from './agent.js';
import { CRITERIA, type Benchmarks, type Criterion, type DecisionResult, type Weights } from './decision.js';
import type { RunMode } from './run-mode.js';

/**
 * A recorded decision (demo step 7, decision log). It keeps what the buyer
 * saw: the request, weights, ranking and the evidence of the chosen offer
 * with its sources, so the decision can be explained later (e.g. in an audit).
 */
/** Who recorded a decision (simulated demo user, no real login). */
export interface DecidedBy {
  name: string;
  role: string;
}

export interface DecisionRecord {
  recordId: string;
  /** Missing in records made before 6 Nov 2026. */
  decidedBy?: DecidedBy | null;
  recordedAt: string;
  runId: string;
  mode: RunMode;
  partId: string;
  quantity: number;
  neededBy: string | null;
  chosenSupplierId: string;
  recommendedSupplierId: string | null;
  followsRecommendation: boolean;
  reason: string;
  weights: Weights;
  /** Points per criterion (0–100) are saved since 17 Nov 2026, so the calculation can be followed later. */
  ranking: { rank: number | null; supplierId: string; score: number | null; excluded: boolean; points?: Record<Criterion, number> | null }[];
  /** Reference values "today" the points were measured against (17 Nov 2026); null in older records. */
  reference?: Record<Criterion, { value: number; basis: string }> | null;
  /** Company default weights of the commodity group when the decision was made (10 Nov 2026). */
  defaultWeights?: Weights | null;
  /** Why the buyer changed the default weights; null when they were not changed. */
  weightsReason?: string | null;
  /** The ERP purchase requisition this decision answers (work queue). */
  requisitionId?: string | null;
  /** Chosen offer against the current supplier of the part, for the requested quantity (display only). */
  vsCurrent?: { supplierId: string; totalDeltaEur: number | null; co2TotalDeltaT: number | null } | null;
  /** True when the buyer kept the part's current supplier (20 Nov 2026); missing in older records. */
  keptCurrentSupplier?: boolean;
  evidence: {
    topic: EvidenceTopic;
    value: number | string;
    unit: string;
    status: EvidenceStatus;
    recordId: string;
    location: string;
    retrievedAt: string | null;
  }[];
}

export interface DecisionInput {
  run: AgentRun;
  result: DecisionResult;
  weights: Weights;
  chosenSupplierId: string;
  reason: string;
  recordId: string;
  recordedAt: string;
  decidedBy: DecidedBy | null;
  /** Company default weights; when given, each weight must stay between WEIGHT_MIN and WEIGHT_MAX. */
  defaultWeights?: Weights;
  /** Required (10+ characters) when the weights differ from the defaults. */
  weightsReason?: string;
  requisitionId?: string | null;
  vsCurrent?: DecisionRecord['vsCurrent'];
  /** The part's current supplier, so the record can say whether the buyer kept it. */
  currentSupplierId?: string | null;
  /** Reference values of the part, saved with the record (17 Nov 2026). */
  reference?: Benchmarks | null;
}

/** Text used when the buyer follows the recommendation without writing a reason. */
export const FOLLOWS_RECOMMENDATION_REASON = 'Follows the recommendation.';

/**
 * Builds a record. Excluded offers cannot be chosen; a reason is required when the choice
 * differs from the recommendation, and a weights reason when the weights differ from the defaults.
 */
export function buildDecisionRecord(input: DecisionInput): DecisionRecord {
  const { run, result, weights, chosenSupplierId } = input;
  const reason = input.reason.trim();
  if (!run.request.supplierIds.includes(chosenSupplierId)) {
    throw new Error(`${chosenSupplierId} is not one of the offers`);
  }
  if (result.excluded.some((x) => x.supplierId === chosenSupplierId)) {
    throw new Error('An excluded offer cannot be chosen');
  }
  const recommended = result.recommendation?.supplierId ?? null;
  const follows = recommended === chosenSupplierId;
  // A justification is required only when the buyer deviates from the recommendation (10 Nov 2026).
  if (!follows && reason.length < 10) {
    throw new Error('Please give a reason of at least 10 characters');
  }
  const changedWeights = input.defaultWeights ? weightsDeviate(weights, input.defaultWeights) : false;
  if (input.defaultWeights) checkWeightLimits(weights, input.defaultWeights);
  const weightsReason = (input.weightsReason ?? '').trim();
  if (changedWeights && weightsReason.length < 10) {
    throw new Error('You changed the default weights: please give a reason of at least 10 characters');
  }
  return {
    recordId: input.recordId,
    recordedAt: input.recordedAt,
    decidedBy: input.decidedBy ? { ...input.decidedBy } : null,
    runId: run.runId,
    mode: run.mode,
    partId: run.request.partId,
    quantity: run.request.quantity,
    neededBy: run.request.neededBy,
    chosenSupplierId,
    recommendedSupplierId: recommended,
    followsRecommendation: follows,
    reason: reason.length > 0 ? reason : FOLLOWS_RECOMMENDATION_REASON,
    weights: { ...weights },
    defaultWeights: input.defaultWeights ? { ...input.defaultWeights } : null,
    weightsReason: changedWeights ? weightsReason : null,
    requisitionId: input.requisitionId ?? null,
    vsCurrent: input.vsCurrent ? { ...input.vsCurrent } : null,
    keptCurrentSupplier: input.currentSupplierId != null && input.currentSupplierId === chosenSupplierId,
    reference: input.reference
      ? (Object.fromEntries(CRITERIA.map((c) => [c, { value: input.reference![c].value, basis: input.reference![c].basis }])) as DecisionRecord['reference'])
      : null,
    ranking: [
      ...result.ranked.map((r) => ({ rank: r.rank, supplierId: r.supplierId, score: r.score, excluded: false, points: { ...r.points } })),
      ...result.excluded.map((x) => ({ rank: null, supplierId: x.supplierId, score: null, excluded: true, points: null })),
    ],
    evidence: run.evidence
      .filter((e) => e.supplierId === chosenSupplierId)
      .map((e) => ({
        topic: e.topic,
        value: e.value,
        unit: e.unit,
        status: e.status,
        recordId: e.recordId,
        location: e.location.kind === 'field' ? `field ${e.location.field}` : `page ${e.location.page}: "${e.location.quote}"`,
        retrievedAt: e.retrievedAt,
      })),
  };
}

/** One CSV cell: quoted when needed, quotes doubled; formula-like text is defused for spreadsheets. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value as string | number | boolean);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The decision log as CSV, one row per decision. */
export function decisionsToCsv(records: DecisionRecord[], supplierName: (id: string) => string): string {
  const header = [
    'Recorded at', 'Decided by', 'Part', 'Quantity', 'Needed by', 'Chosen supplier', 'Chosen ID', 'Recommended ID',
    'Follows recommendation', 'Reason', ...CRITERIA.map((c: Criterion) => `Weight ${c} %`),
    ...CRITERIA.map((c: Criterion) => `Default weight ${c} %`), 'Weights reason', 'Requisition', 'Mode', 'Run ID',
  ];
  const rows = records.map((r) => [
    r.recordedAt, r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.role})` : '', r.partId, r.quantity, r.neededBy ?? '', supplierName(r.chosenSupplierId), r.chosenSupplierId,
    r.recommendedSupplierId ?? '', r.followsRecommendation ? 'yes' : 'no', r.reason,
    ...CRITERIA.map((c) => r.weights[c]), ...CRITERIA.map((c) => r.defaultWeights?.[c] ?? ''), r.weightsReason ?? '', r.requisitionId ?? '', r.mode.kind === 'live' ? `live ${r.mode.provider}` : r.mode.kind, r.runId,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}
