import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

// Local settings and keys from the .env in the project root (never committed).
// Online, the same values come from environment variables.
const envFile = process.env.ENV_FILE ?? resolve(process.cwd(), '../.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  // 3001, so the cockpit (Next.js) can use port 3000 locally.
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
