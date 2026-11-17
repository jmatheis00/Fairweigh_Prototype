/**
 * Records everything the static preview needs from a running local server
 * (npm run dev:server, test mode): the demo records, the PDFs and one agent
 * run per product. The agent run is the saved real Gemini run from data/runs
 * when every product has one (decision of 16 Nov 2026: the preview replays them
 * as "Saved run from <date>"); otherwise test-mode runs, with a warning. Writes web/.preview-snapshot/snapshot/, which the preview
 * build copies next to the page. See PLAN.md section 9 ("Static preview").
 *
 *   SERVER_URL=http://localhost:3001 node scripts/record-preview-snapshot.mjs
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER = (process.env.SERVER_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '.preview-snapshot');
const OUT = join(ROOT, 'snapshot');

/** Same mapping as snapshotPath() in src/lib/api.ts. */
const fileFor = (apiPath) => join(OUT, `${apiPath.replace(/^\/api\//, '').replace(/[?=&]/g, '_')}.json`);

async function get(apiPath) {
  const res = await fetch(`${SERVER}${apiPath}`);
  if (!res.ok) throw new Error(`${apiPath}: ${res.status}`);
  return res.json();
}

async function save(apiPath, data) {
  const file = fileFor(apiPath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

async function copy(apiPath) {
  const data = await get(apiPath);
  await save(apiPath, data);
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await rm(ROOT, { recursive: true, force: true });

const mode = await copy('/api/agent/mode');
if (mode.kind !== 'fake') {
  throw new Error(`The server runs in mode "${mode.kind}". Record the preview in test mode (LLM_PROVIDER=fake), so no AI quota is used.`);
}
await copy('/api/agent/usage');
await copy('/api/rules');
const settings = await copy('/api/sim/settings');
const erp = await copy('/api/sim/erp/suppliers');
await copy('/api/sim/ratings/suppliers');
const pcf = await copy('/api/sim/pcf');
await copy('/api/sim/erp/purchase-orders');
await copy('/api/sim/erp/purchase-requisitions');
await copy('/api/sim/example-decisions');
// History and partner data around the suppliers (decision of 8 Nov 2026).
for (const path of ['/api/sim/erp/quotations', '/api/sim/erp/supplier-performance', '/api/sim/ratings/history', '/api/sim/ratings/certificates', '/api/sim/ratings/company-emissions', '/api/sim/risk/alerts']) {
  await copy(path);
}
await copy('/api/sim/documents?type=fine_notice');
// Every PDF of every simulated system: quotations, fine notice, order PDFs, scorecards, PCF data sheets.
const documents = [];
for (const type of ['offer', 'fine_notice', 'purchase_order', 'rating_scorecard', 'pcf_datasheet', 'certificate']) {
  documents.push(...(await get(`/api/sim/documents?type=${type}`)));
}

// Single ERP, rating and PCF records are looked up in these lists by the preview (src/lib/api.ts).
console.log(`${erp.length} suppliers, ${pcf.length} PCF records, ${documents.length} PDFs`);
for (const d of documents) {
  await copy(`/api/sim/documents/${d.documentId}`);
  const res = await fetch(`${SERVER}/api/sim/documents/${d.documentId}/file`);
  if (!res.ok) throw new Error(`PDF ${d.documentId}: ${res.status}`);
  const file = join(OUT, 'sim', 'documents', d.documentId, 'file.pdf');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

const parts = settings.catalog.filter((p) => p.hasOffers);

// Saved real runs (data/runs), read by the server in any mode.
const saved = [];
for (const part of parts) {
  const res = await fetch(`${SERVER}/api/agent/runs/saved/latest?partId=${encodeURIComponent(part.partId)}`);
  if (res.ok) saved.push(await res.json());
}
if (saved.length === parts.length) {
  for (const run of saved) {
    await save(`/api/agent/recorded/${run.request.partId}`, run);
    console.log(`Saved run ${run.request.partId} from ${run.mode.runDate}: ${run.evidence.length} evidence, ${run.gaps.length} gaps`);
  }
  const runDate = saved.map((r) => r.mode.runDate).sort().at(-1);
  await save('/api/agent/mode', { kind: 'saved', runDate });
  console.log(`Snapshot written to ${OUT}`);
  process.exit(0);
}
console.warn(`WARNING: saved real runs for ${saved.length} of ${parts.length} products. The preview uses test-mode runs instead.`);

// One run per product, one after the other (the server allows one at a time).
for (const part of parts) {
  const startRes = await fetch(`${SERVER}/api/agent/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partId: part.partId }),
  });
  if (!startRes.ok) throw new Error(`Run for ${part.partId}: ${startRes.status} ${await startRes.text()}`);
  let run = await startRes.json();
  while (run.status === 'running') {
    await sleep(500);
    run = await get(`/api/agent/runs/${run.runId}`);
  }
  if (run.status !== 'completed') throw new Error(`Run for ${part.partId} failed: ${run.error}`);
  await save(`/api/agent/recorded/${part.partId}`, run);
  console.log(`Recorded ${part.partId}: ${run.evidence.length} evidence, ${run.gaps.length} gaps`);
}

console.log(`Snapshot written to ${OUT}`);
