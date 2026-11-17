import type { SourceSystem } from '@scc/shared';
import type { ToolDefinition } from '../llm/llm-provider.js';
import type { DemoDataRepository } from '../sim-sources/demo-data.repository.js';

export const SUBMIT_TOOL = 'submit_evidence';

const supplierIdParam = {
  type: 'object',
  properties: { supplierId: { type: 'string', description: 'Supplier ID, e.g. S-0013' } },
  required: ['supplierId'],
};

/** The tools from PLAN.md, section 4, plus submit_evidence to end the run. */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'get_erp_record',
    description: 'ERP record of a supplier: complaint rate (quality), on-time delivery rate, price index, lead time.',
    parameters: supplierIdParam,
  },
  {
    name: 'get_rating',
    description: 'Sustainability rating and compliance screening of a supplier: score, LkSG country risk, controversies.',
    parameters: supplierIdParam,
  },
  {
    name: 'get_pcf',
    description: 'Product carbon footprint (kg CO2e per piece) of a supplier for a part, with its data-quality badge (Verified, Supplier-specific, Company estimate or Industry average).',
    parameters: {
      type: 'object',
      properties: {
        supplierId: { type: 'string' },
        partId: { type: 'string', description: 'Part ID, e.g. P-ALU-HSG-01' },
      },
      required: ['supplierId', 'partId'],
    },
  },
  {
    name: 'list_documents',
    description: 'List the documents (offers, reports, certificates, notices) of a supplier.',
    parameters: supplierIdParam,
  },
  {
    name: 'read_document',
    description: 'Read the full text of a document, page by page.',
    parameters: {
      type: 'object',
      properties: { documentId: { type: 'string' } },
      required: ['documentId'],
    },
  },
  {
    name: SUBMIT_TOOL,
    description: 'Submit the final evidence and gaps. Call exactly once, at the end.',
    parameters: {
      type: 'object',
      properties: {
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              supplierId: { type: 'string' },
              topic: { type: 'string', enum: ['quality', 'price', 'co2', 'delivery', 'compliance', 'leadTime'] },
              value: { type: 'string', description: 'The value exactly as in the source; a number as digits.' },
              unit: { type: 'string' },
              sentence: { type: 'string', description: 'One sentence about the value.' },
              recordId: { type: 'string', description: 'recordId of the record or documentId of the document.' },
              field: { type: 'string', description: 'For records: the field name that holds the value.' },
              page: { type: 'integer', description: 'For documents: page number.' },
              quote: { type: 'string', description: 'For documents: the line that states the value, word for word.' },
            },
            required: ['supplierId', 'topic', 'value', 'unit', 'sentence', 'recordId'],
          },
        },
        gaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              supplierId: { type: 'string' },
              topic: { type: 'string', enum: ['quality', 'price', 'co2', 'delivery', 'compliance', 'leadTime'] },
              reason: { type: 'string' },
            },
            required: ['supplierId', 'topic', 'reason'],
          },
        },
      },
      required: ['evidence', 'gaps'],
    },
  },
];

export interface ToolOutcome {
  result: unknown;
  /** Records the tool returned, so the code knows what was retrieved and when. */
  retrieved: { recordId: string; system: SourceSystem }[];
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Runs a data tool. Unknown IDs give an error object, never made-up data. */
export function runDataTool(
  data: DemoDataRepository,
  name: string,
  args: Record<string, unknown>,
): ToolOutcome {
  const notFound = (what: string): ToolOutcome => ({ result: { error: `${what} not found` }, retrieved: [] });
  const one = (record: { recordId: string; system: SourceSystem } | undefined, what: string): ToolOutcome =>
    record ? { result: record, retrieved: [{ recordId: record.recordId, system: record.system }] } : notFound(what);

  switch (name) {
    case 'get_erp_record':
      return one(data.getErpRecord(str(args, 'supplierId')), 'ERP record');
    case 'get_rating':
      return one(data.getRating(str(args, 'supplierId')), 'Rating');
    case 'get_pcf':
      return one(data.getPcf(str(args, 'supplierId'), str(args, 'partId')), 'PCF');
    case 'list_documents':
      // Only titles here; the text comes with read_document.
      return {
        result: data.listDocuments(str(args, 'supplierId')).map((d) => ({
          documentId: d.documentId,
          documentType: d.documentType,
          title: d.title,
          issuedOn: d.issuedOn,
        })),
        retrieved: [],
      };
    case 'read_document':
      return one(data.getDocument(str(args, 'documentId')), 'Document');
    default:
      return { result: { error: `Unknown tool ${name}` }, retrieved: [] };
  }
}
