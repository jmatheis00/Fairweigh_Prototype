import { Body, Controller, Get, Post } from '@nestjs/common';
import type { DecisionRecord } from '@scc/shared';
import { DecisionsService } from './decisions.service.js';

/** Decision Log: read all entries, add one. No change or delete (audit trail). */
@Controller('decisions')
export class DecisionsController {
  constructor(private readonly decisions: DecisionsService) {}

  @Get()
  list(): Promise<DecisionRecord[]> {
    return this.decisions.list();
  }

  @Post()
  add(@Body() body: unknown): Promise<DecisionRecord> {
    return this.decisions.add(body);
  }
}
