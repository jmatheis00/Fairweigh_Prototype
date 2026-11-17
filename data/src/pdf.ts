import PDFDocument from 'pdfkit';
import type { DocumentRecord } from '@scc/shared';

const INK = '#1f1f1f';
const MUTED = '#6b6b6b';
const RULE = '#c8c8c8';

/**
 * Renders a document record as a simple business document: title,
 * a divider, "Label: value" lines and a small footer. The text is exactly the
 * record's lines (the evidence check reads them); only the layout differs.
 * The creation date is fixed to the issue date, so the same input always
 * gives exactly the same file (needed for the up-to-date check).
 */
export function renderPdf(document: DocumentRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 56,
      info: {
        Title: document.title,
        Author: 'Fairweigh prototype (sample data)',
        CreationDate: new Date(`${document.issuedOn}T00:00:00Z`),
      },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const left = pdf.page.margins.left;
    const width = pdf.page.width - left - pdf.page.margins.right;

    document.pages.forEach((page, index) => {
      if (index > 0) pdf.addPage();
      const [title, ...rest] = page.lines;
      const footer = rest.length > 0 && rest.at(-1)!.startsWith('Sample document') ? rest.pop() : undefined;

      if (title) pdf.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(title);
      pdf.moveDown(0.5);
      const y = pdf.y;
      pdf.moveTo(left, y).lineTo(left + width, y).lineWidth(0.8).strokeColor(RULE).stroke();
      pdf.moveDown(1);

      for (const line of rest) {
        const colon = line.indexOf(': ');
        if (colon > 0 && colon < 40) {
          // "Label: value": label in grey, value in black, on one line.
          pdf.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(`${line.slice(0, colon)}: `, { continued: true });
          pdf.fillColor(INK).text(line.slice(colon + 2));
        } else {
          pdf.font('Helvetica').fontSize(10.5).fillColor(INK).text(line);
        }
        pdf.moveDown(0.45);
      }

      if (footer) {
        pdf.moveDown(2);
        const fy = pdf.y;
        pdf.moveTo(left, fy).lineTo(left + width, fy).lineWidth(0.5).strokeColor(RULE).stroke();
        pdf.moveDown(0.6);
        pdf.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(footer);
      }
    });
    pdf.end();
  });
}
