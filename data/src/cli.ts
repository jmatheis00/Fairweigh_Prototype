/**
 * Generates data/sources/ from the team Excel and assumptions.json: one folder per
 * simulated system, each with its JSON records, its PDFs and a README.
 *
 *   npm run data:build              write the files
 *   npm run check -w @scc/data      only check that the files are up to date (used in tests)
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitDataset, type PublicBenchmarkFactor } from '@scc/shared';
import type { Assumptions } from './assumptions.ts';
import { buildDataset } from './build-dataset.ts';
import { readDemoCase, readSupplierRows } from './excel.ts';
import { renderPdf } from './pdf.ts';
import { sourceReadmes } from './source-readmes.ts';

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const EXCEL = root('source/Supplier_Dummy_Data_v2.xlsx');
const ASSUMPTIONS = root('assumptions.json');
const SOURCES = root('sources');

const assumptions = JSON.parse(await readFile(ASSUMPTIONS, 'utf8')) as Assumptions;
const BENCHMARKS = root('source/public-benchmarks.json');
const publicBenchmarks = (JSON.parse(await readFile(BENCHMARKS, 'utf8')) as { factors: PublicBenchmarkFactor[] }).factors;
const dataset = buildDataset(await readSupplierRows(EXCEL), assumptions, await readDemoCase(EXCEL), publicBenchmarks);

const expected = new Map<string, Buffer>();
for (const [path, content] of Object.entries(splitDataset(dataset))) {
  expected.set(join(SOURCES, path), Buffer.from(`${JSON.stringify(content, null, 2)}\n`));
}
for (const document of dataset.documents) {
  expected.set(join(SOURCES, document.file), await renderPdf(document));
}
for (const [path, text] of Object.entries(sourceReadmes(dataset))) {
  expected.set(join(SOURCES, path), Buffer.from(text));
}

async function filesIn(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? filesIn(join(dir, e.name)) : Promise.resolve([join(dir, e.name)]))),
  );
  return nested.flat().filter((f) => !f.endsWith('.DS_Store'));
}

if (process.argv.includes('--check')) {
  const problems: string[] = [];
  for (const [path, content] of expected) {
    const current = await readFile(path).catch(() => null);
    if (!current || !current.equals(content)) problems.push(relative(SOURCES, path));
  }
  for (const path of await filesIn(SOURCES)) {
    if (!expected.has(path)) problems.push(`${relative(SOURCES, path)} (not generated any more)`);
  }
  if (problems.length > 0) {
    console.error(`data/sources/ is out of date. Run: npm run data:build\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('data/sources/ is up to date.');
} else {
  await rm(SOURCES, { recursive: true, force: true });
  for (const [path, content] of expected) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  const count = (heldBy: string) => dataset.documents.filter((d) => d.heldBy === heldBy).length;
  console.log(
    `Wrote data/sources/: ${dataset.erp.length} suppliers, ${dataset.offers.length} quotations, ${dataset.purchaseOrders.length} purchase orders, ` +
      `${dataset.ratings.length} ratings, ${dataset.pcf.length} footprints; PDFs: ${count('documents')} supplier documents, ` +
      `${count('erp')} order PDFs, ${count('ratings')} scorecards.`,
  );
}
