# Server (NestJS)

Serves the cockpit API under `/api`. Runs locally on port 3001.

Commands from the project root:

- `npm run dev:server` starts the server with automatic reload.
- `npm run test -w @scc/server` runs unit and end-to-end tests.

## Simulated source systems

Read-only endpoints for the agent's tools and for opening a source in the cockpit.
They read the system folders in `data/sources/` (client ERP, rating partner, PCF exchange, supplier documents; folder can be changed with `DATA_DIR`). Unknown IDs return 404.

| Endpoint | Returns |
|---|---|
| `GET /api/sim/erp/suppliers/:supplierId` | ERP record (quality, delivery, price index) |
| `GET /api/sim/ratings/suppliers/:supplierId` | Rating and compliance screening |
| `GET /api/sim/pcf/suppliers/:supplierId/parts/:partId` | CO₂ per piece with badge |
| `GET /api/sim/documents?supplierId=…` | Documents of a supplier, with their text per page |
| `GET /api/sim/documents/:documentId` | One document with its text per page |
| `GET /api/sim/documents/:documentId/file` | The PDF |

## Agent

| Endpoint | Does |
|---|---|
| `GET /api/agent/mode` | Current mode: `{"kind":"fake"}` or `{"kind":"live","provider":"gemini"}` |
| `POST /api/agent/runs` | Starts a run in the background (202). Without a body: all demo offers. Only one run at a time (409) |
| `GET /api/agent/runs` | All runs since the server started |
| `GET /api/agent/runs/:runId` | One run with its steps, evidence and gaps |

Settings in `.env` (see `.env.example`):

- `LLM_PROVIDER=fake` (default) uses fixed answers and no quota. It is refused when `NODE_ENV=production`.
- `LLM_PROVIDER=gemini` with `GEMINI_API_KEY` runs the real model (default `gemini-2.5-flash`, change with `GEMINI_MODEL`).
- Completed live runs are saved to `data/runs/` as the marked fallback for the demo. Test-mode runs are never saved.

Fixed limits: 10 model turns, 120 seconds, 2 retries for quota or outage errors.
After every run the evidence check (`src/evidence/evidence-check.ts`) marks each piece of evidence "verified" or "not_verified" and lists the reasons in `checkFailures`. Not verified evidence gets 0 points in the decision engine.
