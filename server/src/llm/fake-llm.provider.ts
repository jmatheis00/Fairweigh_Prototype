import type { AgentRunRequest, DocumentRecord, ErpRecord, PcfRecord, RatingRecord } from '@scc/shared';
import { LlmProvider, type LlmMessage, type LlmRequest, type LlmResponse, type ToolCall } from './llm-provider.js';

/**
 * Fixed answers for local development and tests, so no quota is used.
 * It behaves like a careful model: fetch all sources, then report only
 * what the sources state. Switched off in the online version (CLAUDE.md).
 */
export class FakeLlmProvider extends LlmProvider {
  readonly name = 'fake' as const;
  private counter = 0;

  complete(request: LlmRequest): Promise<LlmResponse> {
    return Promise.resolve(this.next(request.messages));
  }

  private call(name: string, args: Record<string, unknown>): ToolCall {
    this.counter += 1;
    return { id: `fake-${this.counter}`, name, args };
  }

  private next(messages: LlmMessage[]): LlmResponse {
    const task = readTask(messages);
    const results = toolResults(messages);

    // Round 1: ask every system about every supplier.
    if (results.length === 0) {
      return {
        text: null,
        toolCalls: task.supplierIds.flatMap((supplierId) => [
          this.call('get_erp_record', { supplierId }),
          this.call('get_rating', { supplierId }),
          this.call('get_pcf', { supplierId, partId: task.partId }),
          this.call('list_documents', { supplierId }),
        ]),
      };
    }

    // Round 2: read every listed document that was not read yet.
    const listed = results
      .filter((r) => r.name === 'list_documents' && Array.isArray(r.result))
      .flatMap((r) => r.result as { documentId: string }[]);
    const read = new Set(
      results
        .filter((r) => r.name === 'read_document')
        .map((r) => (r.result as { documentId?: string }).documentId),
    );
    const unread = listed.filter((d) => !read.has(d.documentId));
    if (unread.length > 0) {
      return {
        text: null,
        toolCalls: unread.map((d) => this.call('read_document', { documentId: d.documentId })),
      };
    }

    // Round 3: report.
    return { text: null, toolCalls: [this.call('submit_evidence', buildReport(task, results))] };
  }
}

function readTask(messages: LlmMessage[]): AgentRunRequest {
  const first = messages.find((m) => m.role === 'user');
  const match = first && /```json\s*([\s\S]*?)```/.exec(first.text);
  if (!match?.[1]) throw new Error('FakeLlmProvider: task JSON missing in the first message');
  return JSON.parse(match[1]) as AgentRunRequest;
}

function toolResults(messages: LlmMessage[]): { name: string; result: unknown }[] {
  return messages.flatMap((m) => (m.role === 'tool' ? [{ name: m.name, result: m.result }] : []));
}

function isRecord<T>(value: unknown): value is T {
  return typeof value === 'object' && value !== null && !('error' in value);
}

function buildReport(task: AgentRunRequest, results: { name: string; result: unknown }[]) {
  const evidence: Record<string, unknown>[] = [];
  const gaps: Record<string, unknown>[] = [];
  const of = <T extends { supplierId: string }>(tool: string, supplierId: string) =>
    results.map((r) => (r.name === tool ? r.result : null)).find(
      (r): r is T => isRecord<T>(r) && r.supplierId === supplierId,
    );

  for (const supplierId of task.supplierIds) {
    const erp = of<ErpRecord>('get_erp_record', supplierId);
    const rating = of<RatingRecord>('get_rating', supplierId);
    const pcf = of<PcfRecord>('get_pcf', supplierId);
    const docs = results
      .map((r) => (r.name === 'read_document' ? r.result : null))
      .filter((r): r is DocumentRecord => isRecord<DocumentRecord>(r) && r.supplierId === supplierId);
    const offerDoc = docs.find((d) => d.documentType === 'offer');

    if (erp?.complaintRatePercent != null) {
      evidence.push({
        supplierId, topic: 'quality', value: erp.complaintRatePercent, unit: '%',
        sentence: `${erp.complaintRatePercent} % of deliveries had quality complaints.`,
        recordId: erp.recordId, field: 'complaintRatePercent',
      });
    } else {
      gaps.push({ supplierId, topic: 'quality', reason: 'No complaint rate in the ERP.' });
    }

    if (erp?.onTimeDeliveryPercent != null) {
      evidence.push({
        supplierId, topic: 'delivery', value: erp.onTimeDeliveryPercent, unit: '%',
        sentence: `${erp.onTimeDeliveryPercent} % of deliveries arrived on time.`,
        recordId: erp.recordId, field: 'onTimeDeliveryPercent',
      });
    } else {
      gaps.push({ supplierId, topic: 'delivery', reason: 'No on-time delivery rate in the ERP.' });
    }

    if (pcf) {
      evidence.push({
        supplierId, topic: 'co2', value: pcf.pcfKgPerPiece, unit: 'kg CO2e/piece',
        sentence: `The PCF is ${pcf.pcfKgPerPiece} kg CO2e per piece (${pcf.badge}).`,
        recordId: pcf.recordId, field: 'pcfKgPerPiece',
      });
    } else {
      gaps.push({ supplierId, topic: 'co2', reason: 'No PCF for this part.' });
    }

    const priceLine = offerDoc?.pages
      .flatMap((p) => p.lines.map((line) => ({ page: p.page, line })))
      .find((l) => /^Unit price: EUR [\d.,]+/.test(l.line));
    const price = priceLine && /EUR ([\d.,]+)/.exec(priceLine.line)?.[1];
    if (offerDoc && priceLine && price) {
      evidence.push({
        supplierId, topic: 'price', value: Number(price.replace(/,/g, '')), unit: 'EUR/piece',
        sentence: `The offer states a unit price of EUR ${price}.`,
        recordId: offerDoc.documentId, page: priceLine.page, quote: priceLine.line,
      });
    } else {
      gaps.push({ supplierId, topic: 'price', reason: 'No unit price found in the documents.' });
    }

    const leadLine = offerDoc?.pages
      .flatMap((p) => p.lines.map((line) => ({ page: p.page, line })))
      .find((l) => /^Lead time: \d+ days/.test(l.line));
    const days = leadLine && /(\d+) days/.exec(leadLine.line)?.[1];
    if (offerDoc && leadLine && days) {
      evidence.push({
        supplierId, topic: 'leadTime', value: Number(days), unit: 'days',
        sentence: `The offer states a lead time of ${days} days.`,
        recordId: offerDoc.documentId, page: leadLine.page, quote: leadLine.line,
      });
    } else {
      gaps.push({ supplierId, topic: 'leadTime', reason: 'No lead time found in the documents.' });
    }

    if (rating?.lksgCountryRisk === 'High') {
      evidence.push({
        supplierId, topic: 'compliance', value: 'High', unit: 'text',
        sentence: 'The rating lists a high LkSG country risk.', recordId: rating.recordId, field: 'lksgCountryRisk',
      });
    }

    for (const fine of docs.filter((d) => d.documentType === 'fine_notice')) {
      const decision = fine.pages
        .flatMap((p) => p.lines.map((line) => ({ page: p.page, line })))
        .find((l) => l.line.startsWith('Decision: '));
      if (decision) {
        evidence.push({
          supplierId, topic: 'compliance', value: decision.line.slice('Decision: '.length), unit: 'text',
          sentence: 'A fine notice states a legal violation.', recordId: fine.documentId,
          page: decision.page, quote: decision.line,
        });
      }
    }

    if (rating?.controversies && rating.controversies !== 'None known') {
      evidence.push({
        supplierId, topic: 'compliance', value: rating.controversies, unit: 'text',
        sentence: 'The rating lists a controversy.', recordId: rating.recordId, field: 'controversies',
      });
    }
  }
  return { evidence, gaps };
}
