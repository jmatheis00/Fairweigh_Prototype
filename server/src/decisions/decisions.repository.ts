import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { DecisionRecord } from '@scc/shared';

/**
 * Storage for the Decision Log (PLAN.md section 6). Our own interface, like the
 * rules: today a JSON file, later a database table.
 */
export abstract class DecisionsRepository {
  /** All recorded decisions, oldest first. */
  abstract list(): Promise<DecisionRecord[]>;
  abstract add(record: DecisionRecord): Promise<void>;
}

/** File for the recorded decisions. Override with DECISIONS_FILE. */
export function defaultDecisionsFile(): string {
  return process.env.DECISIONS_FILE ?? resolve(process.cwd(), '../data/decisions/decision-log.json');
}

export class JsonFileDecisionsRepository extends DecisionsRepository {
  constructor(private readonly file: string = defaultDecisionsFile()) {
    super();
  }

  async list(): Promise<DecisionRecord[]> {
    const raw = await readFile(this.file, 'utf8').catch(() => null);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DecisionRecord[]) : [];
    } catch {
      return []; // unreadable file: start with an empty log instead of failing
    }
  }

  async add(record: DecisionRecord): Promise<void> {
    const all = [...(await this.list()), record];
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, `${JSON.stringify(all, null, 2)}\n`);
  }
}

/** For tests: keeps the decisions in memory. */
export class InMemoryDecisionsRepository extends DecisionsRepository {
  private records: DecisionRecord[] = [];
  list(): Promise<DecisionRecord[]> {
    return Promise.resolve([...this.records]);
  }
  add(record: DecisionRecord): Promise<void> {
    this.records.push(record);
    return Promise.resolve();
  }
}
