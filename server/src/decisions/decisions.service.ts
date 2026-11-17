import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DecisionRecord } from '@scc/shared';
import { DecisionsRepository } from './decisions.repository.js';

const REQUIRED_TEXT = ['recordId', 'recordedAt', 'runId', 'partId', 'chosenSupplierId'] as const;

/**
 * The Decision Log on the server, so every user and browser sees the same entries.
 * Decisions are only added, never changed or deleted (audit trail).
 */
export class DecisionsService {
  constructor(private readonly repo: DecisionsRepository) {}

  list(): Promise<DecisionRecord[]> {
    return this.repo.list();
  }

  async add(body: unknown): Promise<DecisionRecord> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new BadRequestException('A decision must be an object');
    }
    const record = body as Record<string, unknown>;
    for (const key of REQUIRED_TEXT) {
      if (typeof record[key] !== 'string' || record[key] === '') throw new BadRequestException(`${key} is missing`);
    }
    if (typeof record.reason !== 'string') throw new BadRequestException('reason is missing');
    if (!Array.isArray(record.ranking) || !Array.isArray(record.evidence)) {
      throw new BadRequestException('ranking and evidence must be lists');
    }
    const existing = await this.repo.list();
    if (existing.some((r) => r.recordId === record.recordId)) {
      throw new ConflictException(`Decision ${String(record.recordId)} is already recorded`);
    }
    await this.repo.add(body as DecisionRecord);
    return body as DecisionRecord;
  }
}
