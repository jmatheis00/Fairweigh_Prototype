import { Module } from '@nestjs/common';
import { DemoDataRepository } from '../sim-sources/demo-data.repository.js';
import { SimSourcesModule } from '../sim-sources/sim-sources.module.js';
import { RulesController } from './rules.controller.js';
import { JsonFileRulesRepository, RulesRepository } from './rules.repository.js';
import { RulesService } from './rules.service.js';

@Module({
  imports: [SimSourcesModule],
  controllers: [RulesController],
  providers: [
    { provide: RulesRepository, useFactory: () => new JsonFileRulesRepository() },
    {
      provide: RulesService,
      inject: [RulesRepository, DemoDataRepository],
      useFactory: (repo: RulesRepository, data: DemoDataRepository) => new RulesService(repo, data),
    },
  ],
})
export class RulesModule {}
