import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

/** Decision Log on the server: add, list, reject duplicates. Uses a temporary file. */
describe('Decision Log (e2e)', () => {
  let app: INestApplication<App>;
  const file = join(mkdtempSync(join(tmpdir(), 'scc-decisions-')), 'decision-log.json');
  const record = {
    recordId: 'D-test-1',
    recordedAt: '2026-11-16T10:00:00.000Z',
    runId: 'run-1',
    mode: { kind: 'fake' },
    partId: 'P-1',
    quantity: 100,
    neededBy: null,
    chosenSupplierId: 'S-1',
    recommendedSupplierId: 'S-1',
    followsRecommendation: true,
    reason: '',
    weights: { quality: 25, price: 25, co2: 25, delivery: 25 },
    ranking: [],
    evidence: [],
  };

  beforeAll(async () => {
    process.env.DECISIONS_FILE = file;
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.DECISIONS_FILE;
    await app.close();
  });

  it('starts empty, saves a decision to the file and refuses the same decision twice', async () => {
    await request(app.getHttpServer()).get('/api/decisions').expect(200, []);
    await request(app.getHttpServer()).post('/api/decisions').send(record).expect(201);
    const list = await request(app.getHttpServer()).get('/api/decisions').expect(200);
    expect(list.body).toEqual([record]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([record]);
    await request(app.getHttpServer()).post('/api/decisions').send(record).expect(409);
    await request(app.getHttpServer()).post('/api/decisions').send({ recordId: 'x' }).expect(400);
  });
});
