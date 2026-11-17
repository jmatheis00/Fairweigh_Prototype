import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import type { AgentRun, RunMode } from '@scc/shared';
import { RunsService, type PurchaseRequestForm, type RunUsage } from './runs.service.js';

/** Accepts only the known form fields with the right types. */
function readForm(body: unknown): PurchaseRequestForm {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object') throw new BadRequestException('Body must be an object');
  const { partId, quantity, neededBy } = body as Record<string, unknown>;
  if (partId !== undefined && typeof partId !== 'string') throw new BadRequestException('partId must be text');
  if (quantity !== undefined && typeof quantity !== 'number') throw new BadRequestException('quantity must be a number');
  if (neededBy !== undefined && neededBy !== null && typeof neededBy !== 'string') {
    throw new BadRequestException('neededBy must be a date or null');
  }
  return { partId, quantity, neededBy };
}

@Controller('agent')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  /** Which provider runs now, for the mode indicator. */
  @Get('mode')
  mode(): RunMode {
    return this.runs.mode();
  }

  /** Live runs used today and the daily limit. */
  @Get('usage')
  usage(): RunUsage {
    return this.runs.usage();
  }

  /** Starts a run for the request form (product, quantity, needed-by date). */
  @Post('runs')
  @HttpCode(202)
  start(@Body() body?: unknown): AgentRun {
    return this.runs.start(this.runs.buildRequest(readForm(body)));
  }

  @Get('runs')
  list(): AgentRun[] {
    return this.runs.list();
  }

  /** The latest saved real run, marked as saved (fallback when the AI is not available). */
  @Get('runs/saved/latest')
  async latestSaved(@Query('partId') partId?: string): Promise<AgentRun> {
    const run = await this.runs.latestSaved(partId || undefined);
    if (!run) throw new NotFoundException('No saved run yet. A saved run is written after the first successful live run.');
    return run;
  }

  @Get('runs/:runId')
  get(@Param('runId') runId: string): AgentRun {
    return this.runs.get(runId);
  }
}
