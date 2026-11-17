/** Response of GET /api/health. Shows that server and cockpit are connected. */
export interface HealthResponse {
  status: 'ok';
  service: 'server';
  demoDataNotice: string;
}
