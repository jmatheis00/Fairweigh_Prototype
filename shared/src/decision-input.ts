import type { AgentRun, Evidence, EvidenceTopic } from './agent.js';
import { CRITERIA, type Criterion, type DecisionOffer, type KnockOut } from './decision.js';
import { checkLeadTime, formatDay } from './purchase.js';
import { isSupplierSpecific } from './sources.js';

/**
 * Turns a checked agent run into the input of the decision engine.
 * Fixed rules (CLAUDE.md):
 * - Only verified values count; everything else gets 0 points in the engine.
 * - Knock-outs (team rule set, Excel v2, decided 8 Nov 2026), each from verified evidence:
 *   a fine notice (proven legal violation); LkSG country risk "High" without a
 *   social audit (SA8000, rule K2); a known child or forced labour controversy (K3).
 * - Other controversies, medium risk, old or indicative prices and late delivery
 *   (also K1, the maximum lead time) are warnings and never change the score.
 */

const LABEL: Record<Criterion, string> = {
  quality: 'Product quality',
  price: 'Price',
  co2: 'CO₂',
  delivery: 'Delivery reliability',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function verifiedEvidence(run: AgentRun, supplierId: string, topic: EvidenceTopic): Evidence | undefined {
  return run.evidence.find((e) => e.supplierId === supplierId && e.topic === topic && e.status === 'verified');
}

/** Evidence for a matrix cell: verified first, otherwise the rejected one, so it can still be opened. */
export function cellEvidence(run: AgentRun, supplierId: string, topic: EvidenceTopic): Evidence | undefined {
  return verifiedEvidence(run, supplierId, topic) ?? run.evidence.find((e) => e.supplierId === supplierId && e.topic === topic);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
}

export interface DecisionInputOptions {
  /** Today as YYYY-MM-DD. */
  today: string;
  /** Prices older than this show "outdated". */
  priceMaxAgeDays: number;
  /** CO2 values (PCF) older than this show "old CO2 data". */
  co2MaxAgeDays: number;
  /** Rule of the Scope 3 manager: warn when the CO2 value is estimated. */
  flagEstimatedCo2?: boolean;
}

function knockOutOf(run: AgentRun, supplierId: string): KnockOut | null {
  const proof = run.evidence.find(
    (e) =>
      e.supplierId === supplierId &&
      e.topic === 'compliance' &&
      e.status === 'verified' &&
      e.sourceDocumentType === 'fine_notice',
  );
  if (proof) {
    const when = proof.sourceDate ? ` (${formatDay(proof.sourceDate)})` : '';
    return { reason: `Proven violation: ${String(proof.value)}${when}`, recordId: proof.recordId };
  }
  const rating = (field: string) =>
    run.evidence.filter(
      (e) =>
        e.supplierId === supplierId &&
        e.topic === 'compliance' &&
        e.status === 'verified' &&
        e.location.kind === 'field' &&
        e.location.field === field,
    );
  // K3: a known child or forced labour controversy.
  const labour = rating('controversies').find((e) => CHILD_OR_FORCED_LABOUR.test(String(e.value)));
  if (labour) return { reason: `Child or forced labour reported: ${String(labour.value)}`, recordId: labour.recordId };
  // K2: high LkSG country risk without a social audit certificate.
  const risk = rating('lksgCountryRisk').find((e) => e.value === 'High' && e.socialAudit === false);
  if (risk) return { reason: 'LkSG country risk High without a valid social audit (SA8000)', recordId: risk.recordId };
  return null;
}

/** Rule K3 of the team rule set. */
export const CHILD_OR_FORCED_LABOUR = /\b(child|forced)\s+labou?r\b/i;

function warningsOf(run: AgentRun, supplierId: string, options: DecisionInputOptions): string[] {
  const warnings: string[] = [];
  for (const e of run.evidence) {
    if (e.supplierId !== supplierId || e.topic !== 'compliance' || e.status !== 'verified') continue;
    if (e.sourceDocumentType === 'fine_notice') continue; // already the knock-out
    if (e.location.kind === 'field' && e.location.field === 'lksgCountryRisk') {
      warnings.push(`LkSG country risk: ${String(e.value)}`);
    } else {
      warnings.push(`Reported: ${String(e.value)}`);
    }
  }

  const price = verifiedEvidence(run, supplierId, 'price');
  if (price?.sourceDate) {
    const age = daysBetween(price.sourceDate, options.today);
    if (age >= options.priceMaxAgeDays) {
      warnings.push(`Price outdated: ${age} days old (${formatDay(price.sourceDate)})`);
    }
  }
  const co2 = verifiedEvidence(run, supplierId, 'co2');
  if (co2?.sourceDate) {
    const age = daysBetween(co2.sourceDate, options.today);
    if (age >= options.co2MaxAgeDays) {
      const years = Math.round((age / 365) * 10) / 10;
      warnings.push(`CO₂ data outdated: ${years} years old (${formatDay(co2.sourceDate)})`);
    }
  }
  if (options.flagEstimatedCo2 && co2?.sourceBadge && !isSupplierSpecific(co2.sourceBadge)) {
    warnings.push('CO₂ value estimated, not supplier-specific (rule of the Scope 3 manager)');
  }
  if (price?.location.kind === 'document' && /indicative/i.test(price.location.quote)) {
    warnings.push('Indicative price only, not binding');
  }

  const lead = verifiedEvidence(run, supplierId, 'leadTime');
  const leadCheck = checkLeadTime(
    lead && typeof lead.value === 'number' ? lead.value : null,
    run.request.neededBy,
    options.today,
  );
  if (leadCheck.kind === 'too_late' || leadCheck.kind === 'not_verified') warnings.push(leadCheck.text);

  for (const c of CRITERIA) {
    const pieces = run.evidence.filter((e) => e.supplierId === supplierId && e.topic === c);
    if (pieces.length > 0 && !pieces.some((e) => e.status === 'verified')) {
      warnings.push(`${LABEL[c]}: evidence not verified`);
    }
  }
  return warnings;
}

export function buildDecisionInput(run: AgentRun, options: DecisionInputOptions): DecisionOffer[] {
  return run.request.supplierIds.map((supplierId) => {
    const values = Object.fromEntries(
      CRITERIA.map((c) => {
        const e = verifiedEvidence(run, supplierId, c);
        return [c, e && typeof e.value === 'number' ? e.value : null];
      }),
    ) as Record<Criterion, number | null>;
    // CO₂ that is not the supplier's own figure for this part counts at most as today (19 Nov 2026).
    const co2 = verifiedEvidence(run, supplierId, 'co2');
    const estimated: Criterion[] = co2?.sourceBadge && !isSupplierSpecific(co2.sourceBadge) ? ['co2'] : [];
    return {
      supplierId,
      values,
      estimated,
      knockOut: knockOutOf(run, supplierId),
      warnings: warningsOf(run, supplierId, options),
    };
  });
}
