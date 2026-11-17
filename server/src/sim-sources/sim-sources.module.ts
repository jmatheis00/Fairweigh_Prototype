import { Module } from '@nestjs/common';
import { DemoDataRepository, JsonFileDemoDataRepository } from './demo-data.repository.js';
import { SimSourcesController } from './sim-sources.controller.js';

@Module({
  controllers: [SimSourcesController],
  providers: [{ provide: DemoDataRepository, useFactory: () => new JsonFileDemoDataRepository() }],
  exports: [DemoDataRepository],
})
export class SimSourcesModule {}
