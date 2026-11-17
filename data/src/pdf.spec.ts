import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import type { DocumentRecord } from '@scc/shared';
import { formatDate } from './offer-document.ts';
import { renderPdf } from './pdf.ts';

const record: DocumentRecord = {
  recordId: 'DOC-OFFER-S-0013',
  documentId: 'DOC-OFFER-S-0013',
  system: 'documents',
  supplierId: 'S-0013',
  notice: 'Demo data, fictitious',
  provenance: { file: 'x.xlsx', sheet: 'Suppliers', row: 15, assumedFields: [] },
  documentType: 'offer',
  title: 'Quotation test',
  file: 'supplier-documents/quotations/DOC-OFFER-S-0013.pdf',
  heldBy: 'documents',
  issuedOn: '2026-10-12',
  pages: [
    { page: 1, lines: ['Quotation test', 'Unit price: EUR 18.36 per piece', 'Total: EUR 183,600.00'] },
    { page: 2, lines: ['Quotation test', 'Valid until: 31 Jan 2027'] },
  ],
};

/** Text lines of each page, as a PDF reader sees them. */
async function extractLines(pdf: Buffer): Promise<string[][]> {
  const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
  const pages: string[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const items = content.items.flatMap((item) => ('str' in item && item.str.trim() ? [item.str] : []));
    pages.push(items);
  }
  return pages;
}

describe('renderPdf', () => {
  it('puts every line on the stated page, readable by a PDF reader', async () => {
    const pages = await extractLines(await renderPdf(record));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(record.pages[0]!.lines);
    expect(pages[1]).toEqual(record.pages[1]!.lines);
  });

  it('gives exactly the same file for the same input', async () => {
    const a = await renderPdf(record);
    const b = await renderPdf(record);
    expect(a.equals(b)).toBe(true);
  });
});

describe('formatDate', () => {
  it('writes dates in English', () => {
    expect(formatDate('2026-10-12')).toBe('12 Oct 2026');
  });
});
