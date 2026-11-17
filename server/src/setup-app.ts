import type { INestApplication } from '@nestjs/common';

/** Shared settings for the real start and the end-to-end tests. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
