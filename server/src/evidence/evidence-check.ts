import type {
  AgentRunRequest,
  DocumentRecord,
  Evidence,
  EvidenceTopic,
  SourceSystem,
} from '@scc/shared';
import type { DemoDataRepository, SourceRecord } from '../sim-sources/demo-data.repository.js';

/**
 * The evidence check (PLAN.md, section 4). Runs in code after every agent run:
 * - Does the source exist?
 * - Is the value at the stated location?
 * - Do unit and supplier match?
 * Evidence that fails any rule is "not_verified" and later gets 0 points.
 */

interface TopicRule {
  system: SourceSystem;
  /** Field that must hold the value, for record-based topics. */
  field?: string;
  /** Unit after normalising; undefined means any unit. */
  unit?: string;
}

const RULES: Record<Exclude<EvidenceTopic, 'compliance'>, TopicRule> = {
  quality: { system: 'erp', field: 'complaintRatePercent', unit: '%' },
  delivery: { system: 'erp', field: 'onTimeDeliveryPercent', unit: '%' },
  co2: { system: 'pcf', field: 'pcfKgPerPiece', unit: 'kgco2e/piece' },
  price: { system: 'documents', unit: 'eur/piece' },
  leadTime: { system: 'documents', unit: 'days' },
};

/** Compliance findings may come from the rating or from a document. */
const COMPLIANCE_SOURCES: SourceSystem[] = ['ratings', 'documents'];
const COMPLIANCE_FIELDS = ['controversies', 'lksgCountryRisk'];

/** "EUR per piece", "€/pc" and "eur/piece" are the same unit. */
export function normaliseUnit(unit: string): string {
  return unit
    .toLowerCase()
    .replace(/€/g, 'eur')
    .replace(/co₂/g, 'co2')
    .replace(/\s+per\s+/g, '/')
    .replace(/\s+/g, '')
    .replace(/\/(pcs|pc|pieces|piece|unit)$/, '/piece')
    .replace(/^percent$/, '%')
    .replace(/^day$/, 'days');
}

/** All numbers in a text, e.g. "EUR 1,234.50 per piece" -> [1234.5]. */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

function fieldValue(record: SourceRecord, field: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, field)
    ? (record as unknown as Record<string, unknown>)[field]
    : undefined;
}

function checkField(evidence: Evidence, record: SourceRecord, field: string, expectedField?: string): string[] {
  const failures: string[] = [];
  if (expectedField && field !== expectedField) {
    failures.push(`field ${field} does not hold the ${evidence.topic} value (expected ${expectedField})`);
    return failures;
  }
  const actual = fieldValue(record, field);
  if (actual === undefined) {
    failures.push(`field ${field} does not exist in ${record.recordId}`);
  } else if (actual === null) {
    failures.push(`field ${field} is empty in ${record.recordId}`);
  } else if (typeof evidence.value === 'number') {
    if (typeof actual !== 'number' || !sameNumber(actual, evidence.value)) {
      failures.push(`value ${evidence.value} differs from the source (${String(actual as string | number)})`);
    }
  } else if (typeof actual !== 'string' || squash(actual) !== squash(evidence.value)) {
    failures.push('text differs from the source');
  }
  return failures;
}

function checkQuote(evidence: Evidence, document: DocumentRecord, page: number, quote: string): string[] {
  const pageText = document.pages.find((p) => p.page === page);
  if (!pageText) {
    return [`page ${page} does not exist in ${document.documentId}`];
  }
  const wanted = squash(quote);
  if (wanted.length === 0 || !pageText.lines.some((line) => squash(line).includes(wanted))) {
    return [`quote not found on page ${page} of ${document.documentId}`];
  }
  if (typeof evidence.value === 'number') {
    if (!numbersIn(wanted).some((n) => sameNumber(n, evidence.value as number))) {
      return [`value ${evidence.value} is not in the quote`];
    }
  } else if (!wanted.includes(squash(evidence.value))) {
    return ['text is not in the quote'];
  }
  return [];
}

/** Rules for one piece of evidence; returns the reasons it fails, empty if it passes. */
function failuresOf(evidence: Evidence, data: DemoDataRepository, request: AgentRunRequest): string[] {
  const failures: string[] = [];

  // 1. Does the source exist, and was it retrieved in this run?
  const record = data.findRecord(evidence.recordId);
  if (!record) return [`source ${evidence.recordId} does not exist`];
  if (evidence.retrievedAt === null) failures.push(`source ${evidence.recordId} was not retrieved in this run`);

  // 2. Supplier, system and part.
  if (record.supplierId !== evidence.supplierId) {
    failures.push(`source belongs to ${record.supplierId}, not ${evidence.supplierId}`);
  }
  if (record.system !== evidence.system) {
    failures.push(`source is in system ${record.system}, not ${evidence.system}`);
  }
  const rule = evidence.topic === 'compliance' ? undefined : RULES[evidence.topic];
  const allowedSystems = rule ? [rule.system] : COMPLIANCE_SOURCES;
  if (!allowedSystems.includes(record.system)) {
    failures.push(`${evidence.topic} cannot be proven from system ${record.system}`);
  }
  if (record.system === 'pcf' && record.partId !== request.partId) {
    failures.push(`PCF is for part ${record.partId}, not ${request.partId}`);
  }
  // Price and lead time must come from an offer of this supplier for this part.
  if (evidence.topic === 'price' || evidence.topic === 'leadTime') {
    const offer = data
      .listOffers()
      .find((o) => o.sourceDocumentId === evidence.recordId && o.supplierId === evidence.supplierId);
    if (!offer) failures.push(`${evidence.recordId} is not an offer of ${evidence.supplierId}`);
    else if (offer.partId !== request.partId) failures.push(`offer is for part ${offer.partId}, not ${request.partId}`);
  }

  // 3. Unit.
  if (rule?.unit && normaliseUnit(evidence.unit) !== rule.unit) {
    failures.push(`unit "${evidence.unit}" does not match ${rule.unit}`);
  }

  // 4. Is the value at the stated location?
  const location = evidence.location;
  if (location.kind === 'field') {
    if (record.system === 'documents') {
      failures.push('a document needs a page and a quote, not a field');
    } else {
      const expectedField = rule?.field ?? (COMPLIANCE_FIELDS.includes(location.field) ? location.field : undefined);
      if (!rule && !expectedField) failures.push(`field ${location.field} cannot prove a compliance finding`);
      else failures.push(...checkField(evidence, record, location.field, expectedField));
    }
  } else if (record.system !== 'documents') {
    failures.push('a record needs a field, not a page and a quote');
  } else {
    failures.push(...checkQuote(evidence, record, location.page, location.quote));
  }

  return failures;
}

/**
 * Checks every piece of evidence. Two passing pieces with different values
 * for the same supplier and criterion contradict each other: both fail.
 */
/** The "as of" date of a source: issue date, PCF reference date or the record's last update. */
function sourceDateOf(source: ReturnType<DemoDataRepository['findRecord']>): string | null {
  if (!source) return null;
  switch (source.system) {
    case 'documents':
      return source.issuedOn;
    case 'pcf':
      return source.referenceDate;
    case 'erp':
      return 'lastUpdated' in source ? source.lastUpdated : null;
    case 'ratings':
      return source.lastUpdated;
  }
}

export function checkEvidence(
  evidence: Evidence[],
  data: DemoDataRepository,
  request: AgentRunRequest,
): Evidence[] {
  const checked = evidence.map((e) => {
    const failures = failuresOf(e, data, request);
    const source = data.findRecord(e.recordId);
    const document = source?.system === 'documents' ? source : null;
    return {
      ...e,
      status: failures.length === 0 ? 'verified' : 'not_verified',
      checkFailures: failures,
      // Taken from the source, so the AI cannot claim a fine notice or a fresh date.
      sourceDocumentType: document?.documentType ?? null,
      sourceDate: sourceDateOf(source),
      sourceBadge: source?.system === 'pcf' ? source.badge : null,
      socialAudit: source?.system === 'ratings' ? /\bSA8000\b/.test(source.certifications ?? '') : null,
    } as Evidence;
  });

  const groups = new Map<string, Evidence[]>();
  for (const e of checked) {
    if (e.status !== 'verified' || e.topic === 'compliance') continue;
    const key = `${e.supplierId}|${e.topic}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  for (const group of groups.values()) {
    const values = [...new Set(group.map((e) => String(e.value)))];
    if (values.length > 1) {
      for (const e of group) {
        e.status = 'not_verified';
        e.checkFailures = [`contradicting evidence: ${values.join(' vs. ')}`];
      }
    }
  }
  return checked;
}
