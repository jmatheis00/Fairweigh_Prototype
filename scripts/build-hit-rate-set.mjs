/**
 * Builds the hit-rate test set (PLAN.md section 4, "Test set") from the simulated
 * source systems in data/sources: for every product and every supplier with an
 * offer, the value the agent should find per criterion, or null where the agent
 * must report a gap (trap: never invent a value). Plus decoys: PCF records of the
 * same supplier for other parts, which must never be used.
 *
 *   npm run hitrate:set
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const records = (file) => {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/sources', file), 'utf8'));
  return Array.isArray(d) ? d : d.records;
};

const offers = records('client-erp/quotations.json');
const erp = new Map(records('client-erp/suppliers.json').map((r) => [r.supplierId, r]));
const ratings = new Map(records('partner-ratings/ratings.json').map((r) => [r.supplierId, r]));
const pcf = records('partner-pcf-exchange/footprints.json');
const fines = records('supplier-documents/documents.json').filter((d) => d.documentType === 'fine_notice');

const parts = [...new Set(offers.map((o) => o.partId))].sort();
const testSet = {
  notice: 'Generated from data/sources by scripts/build-hit-rate-set.mjs. Demo data, fictitious.',
  builtAt: new Date().toISOString().slice(0, 10),
  parts: parts.map((partId) => ({
    partId,
    suppliers: offers
      .filter((o) => o.partId === partId)
      .map((o) => {
        const e = erp.get(o.supplierId);
        const r = ratings.get(o.supplierId);
        const footprint = pcf.find((p) => p.supplierId === o.supplierId && p.partId === partId);
        const compliance = [
          ...(r?.lksgCountryRisk === 'High' ? ['LkSG country risk High'] : []),
          ...(r?.controversies && r.controversies !== 'None known' ? [`Controversy: ${r.controversies}`] : []),
          ...fines.filter((f) => f.supplierId === o.supplierId).map((f) => `Fine notice ${f.documentId}`),
        ];
        return {
          supplierId: o.supplierId,
          expected: {
            quality: e?.complaintRatePercent ?? null,
            delivery: e?.onTimeDeliveryPercent ?? null,
            co2: footprint?.pcfKgPerPiece ?? null,
            price: o.unitPriceEur,
            leadTime: o.leadTimeDays ?? null,
          },
          compliance,
          decoys: pcf.filter((p) => p.supplierId === o.supplierId && p.partId !== partId).map((p) => p.recordId),
        };
      }),
  })),
};

const out = join(ROOT, 'data/test-set/hit-rate.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(testSet, null, 2)}\n`);
const n = testSet.parts.reduce((s, p) => s + p.suppliers.length, 0);
console.log(`Test set: ${parts.length} products, ${n} offers -> ${out}`);
