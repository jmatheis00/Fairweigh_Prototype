/**
 * Records one real agent run per product against a running server with a real
 * provider (LLM_PROVIDER=gemini). The server saves every completed real run in
 * data/runs; those runs are the fallback, the static preview's demo and the input
 * of the hit rate (decision of 16 Nov 2026).
 *
 * Mind the free Gemini quota: about 20 requests per day and model, and one run
 * needs about 10. Record one product at a time if needed:
 *
 *   SERVER_URL=http://localhost:3002 npm run runs:record -- P-ALU-HSG-01
 */
const SERVER = (process.env.SERVER_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mode = await (await fetch(`${SERVER}/api/agent/mode`)).json();
if (mode.kind !== 'live') {
  console.error(`The server runs in mode "${mode.kind}". Start it with LLM_PROVIDER=gemini; test-mode runs are never saved.`);
  process.exit(1);
}
const settings = await (await fetch(`${SERVER}/api/sim/settings`)).json();
const wanted = process.argv.slice(2);
const parts = settings.catalog.filter((p) => p.hasOffers && (wanted.length === 0 || wanted.includes(p.partId)));

let failed = 0;
for (const part of parts) {
  const res = await fetch(`${SERVER}/api/agent/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partId: part.partId }),
  });
  if (!res.ok) {
    console.error(`${part.partId}: could not start (${res.status}) ${await res.text()}`);
    failed += 1;
    continue;
  }
  let run = await res.json();
  while (run.status === 'running') {
    await sleep(2000);
    run = await (await fetch(`${SERVER}/api/agent/runs/${run.runId}`)).json();
  }
  if (run.status !== 'completed') {
    console.error(`${part.partId}: failed: ${String(run.error).split('\n')[0]}`);
    failed += 1;
    continue;
  }
  const rejected = run.evidence.filter((e) => e.status === 'not_verified').length;
  console.log(`${part.partId}: saved, ${run.evidence.length} evidence (${rejected} not verified), ${run.gaps.length} gaps`);
}
process.exit(failed ? 1 : 0);
