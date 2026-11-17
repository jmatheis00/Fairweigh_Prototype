import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { AgentRun } from '@scc/shared';
import { AppModule } from '../src/app.module.js';
import { RunsService } from '../src/agents/runs.service.js';
import { setupApp } from '../src/setup-app.js';

describe('Agent runs (e2e, FakeLlmProvider)', () => {
  let app: INestApplication<App>;
  let runs: RunsService;
  const runsDir = mkdtempSync(join(tmpdir(), 'scc-runs-'));

  beforeAll(async () => {
    process.env.RUNS_DIR = runsDir;
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
    runs = app.get(RunsService);
  });

  afterAll(async () => {
    delete process.env.RUNS_DIR;
    await app.close();
  });

  it('shows test mode', async () => {
    await request(app.getHttpServer()).get('/api/agent/mode').expect(200).expect({ kind: 'fake' });
  });

  it('starts a run in the background and completes it with evidence', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/agent/runs')
      .send({ partId: 'P-ALU-HSG-01', quantity: 5000, neededBy: '2026-12-20' })
      .expect(202);
    const started = start.body as AgentRun;
    expect(started.status).toBe('running');
    expect(started.request).toEqual({
      partId: 'P-ALU-HSG-01',
      supplierIds: ['S-0013', 'S-0015', 'S-0018', 'S-0014', 'S-0020'],
      quantity: 5000,
      neededBy: '2026-12-20',
    });

    await runs.waitFor(started.runId);
    const done = (await request(app.getHttpServer()).get(`/api/agent/runs/${started.runId}`).expect(200)).body as AgentRun;
    expect(done.status).toBe('completed');
    expect(done.mode).toEqual({ kind: 'fake' });
    const s0013 = done.evidence.filter((e) => e.supplierId === 'S-0013');
    expect(s0013.map((e) => e.topic).sort()).toEqual(['co2', 'delivery', 'leadTime', 'price', 'quality']);
    expect(done.steps.length).toBeGreaterThan(3);
    expect(done.evidence.every((e) => e.status === 'verified')).toBe(true);
    expect(done.steps.at(-1)?.summary).toBe(`Evidence check: ${done.evidence.length} verified, 0 not verified`);
  });

  it('does not save fake runs, so they can never become the demo fallback', () => {
    expect(readdirSync(runsDir)).toEqual([]);
  });

  it('rejects an unknown product and a wrong form field', async () => {
    await request(app.getHttpServer()).post('/api/agent/runs').send({ partId: 'P-NOPE' }).expect(400);
    await request(app.getHttpServer()).post('/api/agent/runs').send({ quantity: 'many' }).expect(400);
  });

  it('serves the product list for the form', async () => {
    const res = await request(app.getHttpServer()).get('/api/sim/settings').expect(200);
    expect(res.body.catalog[0]).toMatchObject({ partId: 'P-ALU-HSG-01', hasOffers: true });
    // Since 8 Nov 2026 all five products have quotations and can be requested.
    expect(res.body.catalog.map((p: { partId: string; hasOffers: boolean }) => [p.partId, p.hasOffers])).toEqual([
      ['P-ALU-HSG-01', true],
      ['P-STL-HSG-01', true],
      ['P-CU-WIRE-01', true],
      ['P-BRG-01', true],
      ['P-SEAL-01', true],
    ]);
  });

  it('has no saved fallback run while only test-mode runs exist', async () => {
    await request(app.getHttpServer()).get('/api/agent/runs/saved/latest').expect(404);
  });

  it('returns 404 for an unknown run', async () => {
    await request(app.getHttpServer()).get('/api/agent/runs/nope').expect(404);
  });
});
