import { Module } from '@nestjs/common';
import { DecisionsController } from './decisions.controller.js';
import { DecisionsRepository, JsonFileDecisionsRepository } from './decisions.repository.js';
import { DecisionsService } from './decisions.service.js';

@Module({
  controllers: [DecisionsController],
  providers: [
    { provide: DecisionsRepository, useFactory: () => new JsonFileDecisionsRepository() },
    { provide: DecisionsService, inject: [DecisionsRepository], useFactory: (repo: DecisionsRepository) => new DecisionsService(repo) },
  ],
})
export class DecisionsModule {}
