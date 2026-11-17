import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeLlmProvider } from '../llm/fake-llm.provider.js';
import { LlmProvider, type LlmRequest } from '../llm/llm-provider.js';
import { JsonFileDemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { RunsService } from './runs.service.js';

/** Pretends to be Gemini, answers like the fake. Only for testing the saving. */
class PretendGemini extends LlmProvider {
  readonly name = 'gemini' as const;
  private readonly fake = new FakeLlmProvider();
  complete(req: LlmRequest) {
    return this.fake.complete(req);
  }
}

const limits = { maxModelTurns: 10, timeoutMs: 2_000, retries: 0, retryDelayMs: 1 };

describe('RunsService', () => {
  it('saves completed live runs as JSON for the demo fallback', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scc-runs-'));
    const service = new RunsService(new PretendGemini(), new JsonFileDemoDataRepository(), limits, dir);
    const run = await service.waitFor(service.start().runId);
    expect(run.mode).toEqual({ kind: 'live', provider: 'gemini' });
    expect(run.evidence.length).toBeGreaterThan(20);
    expect(run.evidence.every((e) => e.status === 'verified')).toBe(true);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/_gemini\.json$/);
    expect(JSON.parse(readFileSync(join(dir, files[0]!), 'utf8'))).toMatchObject({ runId: run.runId, status: 'completed' });
  });

  it('builds the request from the form, with defaults', () => {
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, mkdtempSync(join(tmpdir(), 'scc-')));
    expect(service.buildRequest()).toEqual({
      partId: 'P-ALU-HSG-01',
      supplierIds: ['S-0013', 'S-0015', 'S-0018', 'S-0014', 'S-0020'],
      quantity: 2000,
      neededBy: null,
    });
    expect(service.buildRequest({ quantity: 500, neededBy: '2026-12-20' })).toMatchObject({ quantity: 500, neededBy: '2026-12-20' });
  });

  it('builds requests for the steel housing and the copper wire with their own offers and quantities', () => {
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, mkdtempSync(join(tmpdir(), 'scc-')));
    expect(service.buildRequest({ partId: 'P-STL-HSG-01' })).toEqual({
      partId: 'P-STL-HSG-01',
      supplierIds: ['S-0007', 'S-0001', 'S-0008', 'S-0006', 'S-0003'],
      quantity: 5000,
      neededBy: null,
    });
    expect(service.buildRequest({ partId: 'P-CU-WIRE-01' })).toMatchObject({
      supplierIds: ['S-0021', 'S-0022', 'S-0025', 'S-0024', 'S-0026'],
      quantity: 2000,
    });
  });

  it('accepts all five products and rejects unknown products and invalid form values', () => {
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, mkdtempSync(join(tmpdir(), 'scc-')));
    // Since 8 Nov 2026 bearings and seals have quotations too.
    expect(service.buildRequest({ partId: 'P-BRG-01' }).supplierIds).toHaveLength(5);
    expect(service.buildRequest({ partId: 'P-SEAL-01' }).supplierIds).toHaveLength(5);
    expect(() => service.buildRequest({ partId: 'P-NOPE' })).toThrow('Unknown product');
    expect(() => service.buildRequest({ quantity: 0 })).toThrow('Quantity');
    expect(() => service.buildRequest({ quantity: 2.5 })).toThrow('Quantity');
    expect(() => service.buildRequest({ neededBy: '20.12.2026' })).toThrow('YYYY-MM-DD');
    expect(() => service.buildRequest({ neededBy: '2026-02-30' })).toThrow('YYYY-MM-DD');
  });

  it('stops live runs at the daily limit and starts again the next day', async () => {
    let now = new Date('2026-11-05T10:00:00Z');
    const dir = mkdtempSync(join(tmpdir(), 'scc-runs-'));
    const service = new RunsService(new PretendGemini(), new JsonFileDemoDataRepository(), limits, dir, 2, () => now);
    await service.waitFor(service.start().runId);
    await service.waitFor(service.start().runId);
    expect(service.usage()).toEqual({ liveRunsToday: 2, dailyLimit: 2 });
    expect(() => service.start()).toThrow('Daily limit of 2 live runs reached');
    now = new Date('2026-11-06T00:00:01Z');
    expect(service.usage().liveRunsToday).toBe(0);
    await service.waitFor(service.start().runId);
  });

  it('does not count test-mode runs against the daily limit', async () => {
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, mkdtempSync(join(tmpdir(), 'scc-')), 1);
    await service.waitFor(service.start().runId);
    await service.waitFor(service.start().runId);
    expect(service.usage().liveRunsToday).toBe(0);
  });

  it('loads the latest saved real run as the fallback, marked as saved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scc-saved-'));
    const base = { runId: 'x', request: {}, steps: [], evidence: [], gaps: [], error: null, finishedAt: null };
    const write = (name: string, run: object) => writeFileSync(join(dir, name), JSON.stringify(run));
    write('a.json', { ...base, runId: 'old', mode: { kind: 'live', provider: 'gemini' }, status: 'completed', startedAt: '2026-11-17T10:00:00Z' });
    write('b.json', { ...base, runId: 'new', request: { partId: 'P-ALU-HSG-01' }, mode: { kind: 'live', provider: 'groq' }, status: 'completed', startedAt: '2026-11-18T09:00:00Z' });
    write('e.json', { ...base, runId: 'steel', request: { partId: 'P-STL-HSG-01' }, mode: { kind: 'live', provider: 'gemini' }, status: 'completed', startedAt: '2026-11-16T09:00:00Z' });
    write('c.json', { ...base, runId: 'fake', mode: { kind: 'fake' }, status: 'completed', startedAt: '2026-11-19T09:00:00Z' });
    write('d.json', { ...base, runId: 'failed', mode: { kind: 'live', provider: 'gemini' }, status: 'failed', startedAt: '2026-11-20T09:00:00Z' });
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, dir);
    const saved = await service.latestSaved();
    expect(saved?.runId).toBe('new');
    expect(saved?.mode).toEqual({ kind: 'saved', runDate: '2026-11-18' });
    // Per product: the latest saved run for that part only.
    expect((await service.latestSaved('P-STL-HSG-01'))?.runId).toBe('steel');
    expect((await service.latestSaved('P-ALU-HSG-01'))?.runId).toBe('new');
    expect(await service.latestSaved('P-CU-WIRE-01')).toBeNull();
  });

  it('has no fallback when nothing was saved', async () => {
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, mkdtempSync(join(tmpdir(), 'scc-')));
    expect(await service.latestSaved()).toBeNull();
    const missing = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, join(tmpdir(), 'does-not-exist-scc'));
    expect(await missing.latestSaved()).toBeNull();
  });

  it('allows only one run at a time', async () => {
    const service = new RunsService(new FakeLlmProvider(), new JsonFileDemoDataRepository(), limits, mkdtempSync(join(tmpdir(), 'scc-')));
    const first = service.start();
    expect(() => service.start()).toThrow('already in progress');
    await service.waitFor(first.runId);
    expect(() => service.start()).not.toThrow();
  });
});
