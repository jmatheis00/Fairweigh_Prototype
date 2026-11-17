import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module.js';
import { HealthController } from './health/health.controller.js';
import { DecisionsModule } from './decisions/decisions.module.js';
import { RulesModule } from './rules/rules.module.js';
import { SimSourcesModule } from './sim-sources/sim-sources.module.js';

@Module({
  imports: [SimSourcesModule, AgentsModule, RulesModule, DecisionsModule],
  controllers: [HealthController],
})
export class AppModule {}
