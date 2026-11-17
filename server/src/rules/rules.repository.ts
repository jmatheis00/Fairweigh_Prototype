import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BuyerRules } from '@scc/shared';

/**
 * Storage for the buyer rules (PLAN.md section 9). Our own interface, like the
 * demo data: today a JSON file, later a database table.
 */
export abstract class RulesRepository {
  /** The saved rules, or null if nobody has changed the defaults yet. */
  abstract load(): Promise<BuyerRules | null>;
  abstract save(rules: BuyerRules): Promise<void>;
  /** Removes saved rules, so the defaults of the demo settings apply again. */
  abstract clear(): Promise<void>;
}

/** File for the saved rules. Override with RULES_FILE. */
export function defaultRulesFile(): string {
  return process.env.RULES_FILE ?? resolve(process.cwd(), '../data/rules/buyer-rules.json');
}

export class JsonFileRulesRepository extends RulesRepository {
  constructor(private readonly file: string = defaultRulesFile()) {
    super();
  }

  async load(): Promise<BuyerRules | null> {
    const raw = await readFile(this.file, 'utf8').catch(() => null);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as BuyerRules;
    } catch {
      return null; // unreadable file: fall back to the defaults instead of failing
    }
  }

  async save(rules: BuyerRules): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, `${JSON.stringify(rules, null, 2)}\n`);
  }

  async clear(): Promise<void> {
    await rm(this.file, { force: true });
  }
}

/** For tests: keeps the rules in memory. */
export class InMemoryRulesRepository extends RulesRepository {
  private rules: BuyerRules | null = null;
  load(): Promise<BuyerRules | null> {
    return Promise.resolve(this.rules);
  }
  save(rules: BuyerRules): Promise<void> {
    this.rules = rules;
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.rules = null;
    return Promise.resolve();
  }
}
