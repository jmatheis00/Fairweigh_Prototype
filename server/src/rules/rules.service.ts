import { BadRequestException, Injectable } from '@nestjs/common';
import { validateRules, type BuyerRules } from '@scc/shared';
import { DemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { RulesRepository } from './rules.repository.js';

/** Current buyer rules: the saved ones, otherwise the defaults from the demo settings. */
@Injectable()
export class RulesService {
  constructor(
    private readonly repository: RulesRepository,
    private readonly data: DemoDataRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  defaults(): BuyerRules {
    const s = this.data.getSettings();
    return {
      priceMaxAgeDays: s.priceMaxAgeDays,
      co2MaxAgeDays: s.co2MaxAgeDays,
      co2PricePerTonneEur: s.co2PricePerTonneEur,
      flagEstimatedCo2: false,
      co2Targets: s.defaultCo2Targets,
      showBuyerTargets: true,
      updatedBy: null,
      updatedAt: null,
    };
  }

  /** Saved rules count only when someone changed them; otherwise the current defaults apply. */
  async current(): Promise<BuyerRules> {
    const saved = await this.repository.load();
    // Rules saved before a field existed get its default.
    return saved && saved.updatedBy ? { ...this.defaults(), ...saved } : this.defaults();
  }

  async update(body: unknown): Promise<BuyerRules> {
    const updatedBy = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).updatedBy : undefined;
    let rules: BuyerRules;
    try {
      rules = validateRules(body, typeof updatedBy === 'string' ? updatedBy : '', this.now().toISOString());
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : String(e));
    }
    await this.repository.save(rules);
    return rules;
  }

  /** Back to the defaults: the saved rules are removed, so later changes to the defaults apply too. */
  async reset(): Promise<BuyerRules> {
    await this.repository.clear();
    return this.defaults();
  }
}
