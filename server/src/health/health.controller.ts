import { Controller, Get } from '@nestjs/common';
import { DEMO_DATA_NOTICE, type HealthResponse } from '@scc/shared';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'server', demoDataNotice: DEMO_DATA_NOTICE };
  }
}
