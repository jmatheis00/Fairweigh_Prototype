import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { LlmProvider } from '../llm/llm-provider.js';
import { DemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { SimSourcesModule } from '../sim-sources/sim-sources.module.js';
import { DEFAULT_LIMITS, type AgentLimits } from './agent-runner.js';
import { RunsController } from './runs.controller.js';
import { AGENT_LIMITS, RunsService } from './runs.service.js';

@Module({
  imports: [LlmModule, SimSourcesModule],
  controllers: [RunsController],
  providers: [
    { provide: AGENT_LIMITS, useValue: DEFAULT_LIMITS },
    {
      provide: RunsService,
      inject: [LlmProvider, DemoDataRepository, AGENT_LIMITS],
      useFactory: (llm: LlmProvider, data: DemoDataRepository, limits: AgentLimits) =>
        new RunsService(llm, data, limits),
    },
  ],
})
export class AgentsModule {}
