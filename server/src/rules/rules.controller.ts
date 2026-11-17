import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import type { BuyerRules } from '@scc/shared';
import { RulesService } from './rules.service.js';

/**
 * Rules of the Scope 3 manager for buyers. The prototype has no login, so the
 * page decides who may edit (demo users); the server only validates the values.
 */
@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  get(): Promise<BuyerRules> {
    return this.rules.current();
  }

  @Put()
  update(@Body() body: unknown): Promise<BuyerRules> {
    return this.rules.update(body);
  }

  /** Back to the defaults from the demo settings. */
  @Delete()
  reset(): Promise<BuyerRules> {
    return this.rules.reset();
  }
}
