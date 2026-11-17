/**
 * Hit rate of the agent (PLAN.md section 4): scores the latest saved real run per
 * product in data/runs against data/test-set/hit-rate.json. Test-mode runs are never
 * saved there, so the fake provider can never deliver the hit rate (CLAUDE.md).
 *
 *   npm run hitrate                 latest saved run per product
 *   npm run hitrate -- file.json    one or more given run files
 *
 * Two figures:
 * - Agent: what the model reported, before the evidence check.
 * - After check: only verified evidence, i.e. what the ranking uses.
 * A check counts as a hit when the right value is reported, or when the agent
 * reports no value where the source has none (trap: a gap must stay a gap).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const testSet = JSON.parse(readFileSync(join(ROOT, 'data/test-set/hit-rate.json'), 'utf8'));
const runsDir = join(ROOT, 'data/runs');

const given = process.argv.slice(2);
const files = given.length
  ? given.map((f) => resolve(f))
  : readdirSync(runsDir).filter((f) => f.endsWith('.json')).map((f) => join(runsDir, f));
const latest = new Map();
for (const file of files) {
  const run = JSON.parse(readFileSync(file, 'utf8'));
  if (run.mode?.kind !== 'live' || run.status !== 'completed') continue;
  const prev = latest.get(run.request.partId);
  if (!prev || prev.run.startedAt < run.startedAt) latest.set(run.request.partId, { run, file });
}
if (latest.size === 0) {
  console.error('No saved real run found in data/runs. Record runs with a real provider first (PLAN.md section 4).');
  process.exit(1);
}

const TOPICS = ['quality', 'delivery', 'co2', 'price', 'leadTime'];
const same = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9;
// A compliance finding is a red flag, not a "Low" risk or "None known".
const isFlag = (e) => e.topic === 'compliance' && !/^(low|medium|none( known)?|no)$/i.test(String(e.value).trim());

const total = { agent: 0, checked: 0, items: 0, decoyUsed: 0 };
for (const part of testSet.parts) {
  const entry = latest.get(part.partId);
  if (!entry) {
    console.log(`${part.partId}: no saved run`);
    continue;
  }
  const { run } = entry;
  const misses = [];
  let agent = 0;
  let checked = 0;
  let items = 0;
  for (const s of part.suppliers) {
    const mine = run.evidence.filter((e) => e.supplierId === s.supplierId);
    for (const topic of TOPICS) {
      const want = s.expected[topic];
      const reported = mine.filter((e) => e.topic === topic);
      const verified = reported.filter((e) => e.status === 'verified');
      const okAgent = want === null ? reported.length === 0 : reported.some((e) => same(e.value, want));
      const okChecked = want === null ? verified.length === 0 : verified.some((e) => same(e.value, want));
      items += 1;
      agent += okAgent ? 1 : 0;
      checked += okChecked ? 1 : 0;
      if (!okChecked) {
        const got = reported.map((e) => `${e.value} ${e.unit} (${e.status}${e.checkFailures?.length ? `: ${e.checkFailures[0]}` : ''})`).join('; ') || 'nothing';
        misses.push(`${s.supplierId} ${topic}: expected ${want ?? 'a gap'}, got ${got}`);
      }
    }
    const flagged = mine.filter(isFlag);
    const wantFlag = s.compliance.length > 0;
    items += 1;
    agent += flagged.length > 0 === wantFlag ? 1 : 0;
    const okFlag = flagged.some((e) => e.status === 'verified') === wantFlag;
    checked += okFlag ? 1 : 0;
    if (!okFlag) misses.push(`${s.supplierId} compliance: expected ${wantFlag ? s.compliance.join(', ') : 'no finding'}, got ${flagged.map((e) => e.value).join('; ') || 'nothing'}`);
    const decoys = mine.filter((e) => s.decoys.includes(e.recordId));
    total.decoyUsed += decoys.length;
    for (const d of decoys) misses.push(`${s.supplierId}: used decoy ${d.recordId} (${d.status})`);
  }
  total.agent += agent;
  total.checked += checked;
  total.items += items;
  const pct = (n) => `${((100 * n) / items).toFixed(0)} %`;
  console.log(`${part.partId} (run of ${run.startedAt.slice(0, 10)}, ${run.mode.provider}): agent ${agent}/${items} = ${pct(agent)}, after check ${checked}/${items} = ${pct(checked)}`);
  for (const m of misses) console.log(`   - ${m}`);
}
const pct = (n) => `${((100 * n) / total.items).toFixed(1)} %`;
console.log(`\nHit rate: agent ${total.agent}/${total.items} = ${pct(total.agent)} · after evidence check ${total.checked}/${total.items} = ${pct(total.checked)} · decoys used ${total.decoyUsed}`);
