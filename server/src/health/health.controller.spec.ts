import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports readiness and the demo notice', () => {
    expect(new HealthController().getHealth()).toEqual({
      status: 'ok',
      service: 'server',
      demoDataNotice: 'Demo data, fictitious',
    });
  });
});
