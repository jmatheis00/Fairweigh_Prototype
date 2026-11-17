import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

/** The rules page: read, change, reject invalid values, reset. Uses a temporary file. */
describe('Buyer rules (e2e)', () => {
  let app: INestApplication<App>;
  const file = join(mkdtempSync(join(tmpdir(), 'scc-rules-')), 'rules.json');

  beforeAll(async () => {
    process.env.RULES_FILE = file;
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.RULES_FILE;
    await app.close();
  });

  it('serves the defaults, saves a change to the file and resets', async () => {
    const before = await request(app.getHttpServer()).get('/api/rules').expect(200);
    expect(before.body).toMatchObject({ priceMaxAgeDays: 90, co2MaxAgeDays: 365, flagEstimatedCo2: false, updatedBy: null });

    const change = { priceMaxAgeDays: 60, co2MaxAgeDays: 730, co2PricePerTonneEur: 100, flagEstimatedCo2: true, co2Targets: { company: 200, buyers: { Thomas: 120 }, groups: {} }, updatedBy: 'Sarah' };
    const saved = await request(app.getHttpServer()).put('/api/rules').send(change).expect(200);
    expect(saved.body).toMatchObject({ ...change });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ priceMaxAgeDays: 60, updatedBy: 'Sarah' });

    const bad = await request(app.getHttpServer()).put('/api/rules').send({ ...change, co2PricePerTonneEur: -5 }).expect(400);
    expect(bad.body.message).toContain('CO₂ price must be a whole number from 0 to 1000');

    const reset = await request(app.getHttpServer()).delete('/api/rules').expect(200);
    expect(reset.body).toMatchObject({ priceMaxAgeDays: 90, updatedBy: null });
    expect(existsSync(file)).toBe(false);
  });
});
