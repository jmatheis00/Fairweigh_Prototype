import type { AgentStep } from '@scc/shared';
import { FakeLlmProvider } from '../llm/fake-llm.provider.js';
import { LlmProvider, LlmProviderError, type LlmRequest, type LlmResponse } from '../llm/llm-provider.js';
import { JsonFileDemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { AgentRunner, AgentTimeoutError, type AgentLimits } from './agent-runner.js';

const data = new JsonFileDemoDataRepository();
const request = { partId: 'P-ALU-HSG-01', supplierIds: ['S-0013'], quantity: 10000, neededBy: null };
const limits: AgentLimits = { maxModelTurns: 10, timeoutMs: 2_000, retries: 2, retryDelayMs: 1 };

/** A provider that answers with a fixed list of responses (or errors). */
class ScriptedProvider extends LlmProvider {
  readonly name = 'gemini' as const;
  calls = 0;
  constructor(private readonly script: (n: number, req: LlmRequest) => Promise<LlmResponse>) {
    super();
  }
  complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    return this.script(this.calls, req);
  }
}

const submit = (args: Record<string, unknown>): LlmResponse => ({
  text: null,
  toolCalls: [{ id: 's', name: 'submit_evidence', args }],
});

describe('AgentRunner with the FakeLlmProvider', () => {
  it('collects all four criteria for S-0013 with exact locations', async () => {
    const steps: AgentStep[] = [];
    const result = await new AgentRunner(new FakeLlmProvider(), data, (s) => steps.push(s), limits).run(request);
    expect(result.evidence.every((e) => e.supplierId === 'S-0013')).toBe(true);

    const byTopic = Object.fromEntries(result.evidence.map((e) => [e.topic, e]));
    expect(byTopic.quality).toMatchObject({ value: 0.8, recordId: 'ERP-S-0013', location: { kind: 'field', field: 'complaintRatePercent' } });
    expect(byTopic.delivery).toMatchObject({ value: 95, system: 'erp', location: { field: 'onTimeDeliveryPercent' } });
    expect(byTopic.co2).toMatchObject({ value: 38, system: 'pcf', recordId: 'PCF-S-0013-P-ALU-HSG-01' });
    expect(byTopic.price).toMatchObject({
      value: 84.5,
      system: 'documents',
      recordId: 'DOC-OFFER-S-0013-P-ALU-HSG-01',
      location: { kind: 'document', page: 1, quote: 'Unit price: EUR 84.50 per piece' },
    });
    expect(result.gaps).toEqual([]);
    for (const e of result.evidence) {
      expect(e.retrievedAt).not.toBeNull();
      expect(e.status).toBe('unchecked');
    }
    expect(steps.map((s) => s.tool)).toContain('read_document');
    expect(byTopic.leadTime).toMatchObject({ value: 24, unit: 'days', location: { kind: 'document', page: 1, quote: 'Lead time: 24 days' } });
    expect(steps.at(-1)?.summary).toBe('5 pieces of evidence, 0 gaps');
  });

  it('reports a gap instead of a value for an unknown supplier', async () => {
    const result = await new AgentRunner(new FakeLlmProvider(), data, () => {}, limits).run({
      ...request,
      supplierIds: ['S-9999'],
    });
    expect(result.evidence).toEqual([]);
    expect(result.gaps.map((g) => g.topic).sort()).toEqual(['co2', 'delivery', 'leadTime', 'price', 'quality']);
  });
});

describe('AgentRunner with all demo suppliers', () => {
  it('finds the gaps, the country risk and the fine notice', async () => {
    const all = { ...request, supplierIds: ['S-0013', 'S-0014', 'S-0015', 'S-0018', 'S-0020', 'S-0005'] };
    const result = await new AgentRunner(new FakeLlmProvider(), data, () => {}, limits).run(all);
    const gaps = (id: string) => result.gaps.filter((g) => g.supplierId === id).map((g) => g.topic).sort();
    expect(gaps('S-0014')).toEqual(['delivery', 'quality']);
    expect(gaps('S-0018')).toEqual(['delivery', 'quality']);
    const compliance = result.evidence.filter((e) => e.topic === 'compliance').map((e) => [e.supplierId, e.recordId]);
    expect(compliance).toEqual(
      expect.arrayContaining([['S-0014', 'RAT-S-0014'], ['S-0005', 'RAT-S-0005'], ['S-0005', 'DOC-FINE-S-0005']]),
    );
  });
});

describe('AgentRunner for a second part', () => {
  it('collects verified evidence for the steel housing, with gaps for the quote-only supplier', async () => {
    const steel = { partId: 'P-STL-HSG-01', supplierIds: ['S-0007', 'S-0003', 'S-0006'], quantity: 5000, neededBy: null };
    const result = await new AgentRunner(new FakeLlmProvider(), data, () => {}, limits).run(steel);
    const value = (id: string, topic: string) => result.evidence.find((e) => e.supplierId === id && e.topic === topic);
    expect(value('S-0007', 'price')).toMatchObject({ value: 46.92, recordId: 'DOC-OFFER-S-0007-P-STL-HSG-01' });
    expect(value('S-0007', 'co2')).toMatchObject({ value: 13.8, recordId: 'PCF-S-0007-P-STL-HSG-01' });
    expect(result.gaps.filter((g) => g.supplierId === 'S-0003').map((g) => g.topic).sort()).toEqual(['delivery', 'quality']);
    // Allegation only: a warning in the rating, no fine notice.
    expect(result.evidence.filter((e) => e.supplierId === 'S-0006' && e.topic === 'compliance').map((e) => e.recordId)).toEqual(['RAT-S-0006']);
  });
});

describe('AgentRunner checks what the model submits', () => {
  it('sets no retrieval time for a source the agent never retrieved', async () => {
    const provider = new ScriptedProvider(() =>
      Promise.resolve(
        submit({
          evidence: [
            { supplierId: 'S-0013', topic: 'quality', value: '0.1', unit: '%', sentence: 'x', recordId: 'ERP-S-0013', field: 'complaintRatePercent' },
          ],
          gaps: [],
        }),
      ),
    );
    const result = await new AgentRunner(provider, data, () => {}, limits).run(request);
    expect(result.evidence[0]).toMatchObject({ value: 0.1, system: 'erp', retrievedAt: null, status: 'unchecked' });
  });

  it('drops other suppliers and turns evidence without location into a gap', async () => {
    const provider = new ScriptedProvider(() =>
      Promise.resolve(
        submit({
          evidence: [
            { supplierId: 'S-0005', topic: 'price', value: '1', unit: 'EUR', sentence: 'x', recordId: 'DOC-X', page: 1, quote: 'q' },
            { supplierId: 'S-0013', topic: 'price', value: '17', unit: 'EUR', sentence: 'x', recordId: 'DOC-OFFER-S-0013-P-ALU-HSG-01' },
            { supplierId: 'S-0013', topic: 'co2', value: 'low', unit: 'kg', sentence: 'x', recordId: 'PCF-1', field: 'pcfKgPerPiece' },
          ],
          gaps: [{ supplierId: 'S-0013', topic: 'delivery', reason: 'not found' }],
        }),
      ),
    );
    const result = await new AgentRunner(provider, data, () => {}, limits).run(request);
    expect(result.evidence).toEqual([]);
    expect(result.gaps.map((g) => g.topic)).toEqual(['price', 'co2', 'delivery']);
    expect(result.gaps[0]?.reason).toContain('no field or page');
  });
});

describe('AgentRunner limits', () => {
  it('stops after the maximum number of model turns', async () => {
    const provider = new ScriptedProvider(() =>
      Promise.resolve({ text: null, toolCalls: [{ id: 'x', name: 'get_rating', args: { supplierId: 'S-0013' } }] }),
    );
    await expect(new AgentRunner(provider, data, () => {}, { ...limits, maxModelTurns: 3 }).run(request)).rejects.toThrow(
      'Step limit reached',
    );
    expect(provider.calls).toBe(3);
  });

  it('retries a temporary provider error and logs the retry', async () => {
    const fake = new FakeLlmProvider();
    const provider = new ScriptedProvider((n, req) =>
      n <= 2 ? Promise.reject(new LlmProviderError('429 quota', true)) : fake.complete(req),
    );
    const steps: AgentStep[] = [];
    const result = await new AgentRunner(provider, data, (s) => steps.push(s), limits).run(request);
    expect(result.evidence).toHaveLength(5);
    expect(steps.filter((s) => s.kind === 'retry')).toHaveLength(2);
  });

  it('does not retry a permanent error', async () => {
    const provider = new ScriptedProvider(() => Promise.reject(new LlmProviderError('400 bad request', false)));
    await expect(new AgentRunner(provider, data, () => {}, limits).run(request)).rejects.toThrow('400');
    expect(provider.calls).toBe(1);
  });

  it('gives up when the time limit is reached', async () => {
    const provider = new ScriptedProvider(() => new Promise(() => {}));
    await expect(
      new AgentRunner(provider, data, () => {}, { ...limits, timeoutMs: 50 }).run(request),
    ).rejects.toBeInstanceOf(AgentTimeoutError);
  });
});
