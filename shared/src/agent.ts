import type { RunMode } from './run-mode.js';
import type { DocumentType, PcfBadge, SourceSystem } from './sources.js';

/**
 * The four criteria, compliance indications (PLAN.md, section 4) and the
 * lead time for the needed-by warning (not a scoring criterion).
 */
export type EvidenceTopic = 'quality' | 'price' | 'co2' | 'delivery' | 'compliance' | 'leadTime';

/** Where exactly a value stands in its source. */
export type EvidenceLocation =
  /** A field of a record, e.g. ERP-S-0013 -> onTimeDeliveryPercent. */
  | { kind: 'field'; field: string }
  /** A passage in a document, quoted word for word. */
  | { kind: 'document'; page: number; quote: string };

/**
 * Result of the evidence check (step 5). Until then every piece of
 * evidence is "unchecked" and must not count in the score.
 */
export type EvidenceStatus = 'unchecked' | 'verified' | 'not_verified';

/** One piece of evidence, as the agent reported it (PLAN.md, section 4). */
export interface Evidence {
  evidenceId: string;
  supplierId: string;
  topic: EvidenceTopic;
  /** Numeric value, or text for compliance findings. */
  value: number | string;
  unit: string;
  /** One sentence from the agent about the value. */
  sentence: string;
  system: SourceSystem;
  /** Record or document ID, e.g. "ERP-S-0013" or "DOC-OFFER-S-0013-P-ALU-HSG-01". */
  recordId: string;
  location: EvidenceLocation;
  /**
   * When the source was retrieved. Set by the code from the tool log,
   * never by the AI. Null if the agent cites a source it never retrieved.
   */
  retrievedAt: string | null;
  status: EvidenceStatus;
  /** Why the evidence check rejected it; empty if verified or unchecked. */
  checkFailures: string[];
  /**
   * Set by the evidence check from the source itself, never by the AI:
   * the type and issue date of a cited document (null for records).
   */
  sourceDocumentType: DocumentType | null;
  sourceDate: string | null;
  /** For CO2 values: "actual" or "estimated", from the PCF record. */
  sourceBadge: PcfBadge | null;
  /**
   * For rating evidence: does the supplier hold a social audit certificate (SA8000)?
   * Set by the evidence check from the rating record, never by the AI. Knock-out rule K2.
   */
  socialAudit?: boolean | null;
}

/** A criterion the agent could not prove, with the reason. */
export interface EvidenceGap {
  supplierId: string;
  topic: EvidenceTopic;
  reason: string;
}

export type AgentStepKind = 'model' | 'tool_call' | 'tool_result' | 'retry' | 'check' | 'error';

/** One logged step of a run, shown as progress and kept for the log. */
export interface AgentStep {
  index: number;
  at: string;
  kind: AgentStepKind;
  summary: string;
  tool?: string;
  input?: Record<string, unknown>;
}

export type AgentRunStatus = 'running' | 'completed' | 'failed';

export interface AgentRunRequest {
  partId: string;
  supplierIds: string[];
  /** Pieces needed; only for totals and the CO2 euro display. */
  quantity: number;
  /** Delivery date (YYYY-MM-DD) for the lead-time warning, or null. */
  neededBy: string | null;
}

export interface AgentRun {
  runId: string;
  request: AgentRunRequest;
  mode: RunMode;
  status: AgentRunStatus;
  startedAt: string;
  finishedAt: string | null;
  steps: AgentStep[];
  evidence: Evidence[];
  gaps: EvidenceGap[];
  error: string | null;
}
