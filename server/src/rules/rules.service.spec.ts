import { JsonFileDemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { InMemoryRulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';

const service = () =>
  new RulesService(new InMemoryRulesRepository(), new JsonFileDemoDataRepository(), () => new Date('2026-11-06T12:00:00Z'));

describe('RulesService', () => {
  it('starts with the demo settings as defaults', async () => {
    expect(await service().current()).toEqual({
      priceMaxAgeDays: 90,
      co2MaxAgeDays: 365,
      co2PricePerTonneEur: 100,
      flagEstimatedCo2: false,
      co2Targets: expect.objectContaining({ company: 200, buyers: { Thomas: 100, Jonas: 60, Lena: 30 } }),
      showBuyerTargets: true,
      updatedBy: null,
      updatedAt: null,
    });
  });

  it('saves a valid change with name and time, and resets to the defaults', async () => {
    const s = service();
    const saved = await s.update({ priceMaxAgeDays: 60, co2MaxAgeDays: 730, co2PricePerTonneEur: 100, flagEstimatedCo2: true, co2Targets: { company: 200, buyers: { Thomas: 120 }, groups: {} }, updatedBy: 'Sarah' });
    expect(saved).toMatchObject({ priceMaxAgeDays: 60, flagEstimatedCo2: true, updatedBy: 'Sarah', updatedAt: '2026-11-06T12:00:00.000Z' });
    expect(await s.current()).toEqual(saved);
    expect((await s.reset()).priceMaxAgeDays).toBe(90);
  });

  it('ignores a saved copy of the defaults, so a new default (e.g. the CO2 price) applies', async () => {
    const repo = new InMemoryRulesRepository();
    await repo.save({ priceMaxAgeDays: 90, co2MaxAgeDays: 365, co2PricePerTonneEur: 75, flagEstimatedCo2: false, co2Targets: { company: 200, buyers: { Thomas: 120 }, groups: {} }, showBuyerTargets: true, updatedBy: null, updatedAt: null });
    const s = new RulesService(repo, new JsonFileDemoDataRepository());
    expect((await s.current()).co2PricePerTonneEur).toBe(100);
  });

  it('fills a field that a rules file saved before 10 Nov 2026 does not have', async () => {
    const repo = new InMemoryRulesRepository();
    const old = { priceMaxAgeDays: 60, co2MaxAgeDays: 365, co2PricePerTonneEur: 100, flagEstimatedCo2: false, updatedBy: 'Sarah', updatedAt: '2026-11-08T10:00:00.000Z' };
    await repo.save(old as never);
    const s = new RulesService(repo, new JsonFileDemoDataRepository());
    expect(await s.current()).toMatchObject({ priceMaxAgeDays: 60, co2Targets: { company: 200, buyers: { Thomas: 100 } }, showBuyerTargets: true, updatedBy: 'Sarah' });
  });

  it('rejects invalid values with a clear message and keeps the old rules', async () => {
    const s = service();
    await expect(s.update({ priceMaxAgeDays: 1, co2MaxAgeDays: 365, co2PricePerTonneEur: 100, flagEstimatedCo2: false, co2Targets: { company: 200, buyers: { Thomas: 120 }, groups: {} }, updatedBy: 'Sarah' })).rejects.toThrow(
      'Price age threshold must be a whole number from 7 to 730',
    );
    expect((await s.current()).updatedBy).toBeNull();
  });
});
