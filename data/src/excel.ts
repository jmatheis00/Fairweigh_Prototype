import ExcelJS from 'exceljs';
import { SOURCE_SHEET, type SupplierRow } from './build-dataset.ts';

/** Most sheets have a title or group row first and column names in row 2. */
const HEADER_ROW = 2;

/** A cell value as plain data: formula cells give their calculated result, links and rich text their text. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v !== 'object') return v;
  if ('result' in v) return plain((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
  if ('text' in v && typeof (v as { text: unknown }).text === 'string') return (v as { text: string }).text;
  return null;
}

async function open(filePath: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

function sheetOf(workbook: ExcelJS.Workbook, name: string, filePath: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found in ${filePath}`);
  return sheet;
}

/** Rows of a table sheet as column name -> value, with their row number. */
function tableRows(sheet: ExcelJS.Worksheet, key: string): SupplierRow[] {
  const columns = new Map<number, string>();
  sheet.getRow(HEADER_ROW).eachCell((c, col) => {
    columns.set(col, String(plain(c.value)).trim());
  });
  const rows: SupplierRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= HEADER_ROW) return;
    const values: Record<string, unknown> = {};
    row.eachCell((c, col) => {
      const name = columns.get(col);
      if (name) values[name] = plain(c.value);
    });
    if (values[key]) rows.push({ row: rowNumber, values, sheet: sheet.name });
  });
  return rows;
}

/** Reads all supplier rows of the "Suppliers" sheet. */
export async function readSupplierRows(filePath: string): Promise<SupplierRow[]> {
  const workbook = await open(filePath);
  return tableRows(sheetOf(workbook, SOURCE_SHEET, filePath), 'supplier_id').map((r) => ({ row: r.row, values: r.values }));
}

/** The demo case sheets of Excel v2 (team data model, 8 Nov 2026). Info requests are not read. */
export interface DemoCaseSheets {
  offers: SupplierRow[];
  pcf: SupplierRow[];
  sources: SupplierRow[];
  categories: SupplierRow[];
  /** "Demo Request" and "Assumptions" as field -> value. */
  request: Record<string, unknown>;
  assumptions: Record<string, unknown>;
}

/** "field | value" sheets: column A is the field, column B the value (header in row 2). */
function keyValues(sheet: ExcelJS.Worksheet): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= HEADER_ROW) return;
    const field = plain(row.getCell(1).value);
    if (typeof field === 'string' && field.trim()) out[field.trim()] = plain(row.getCell(2).value);
  });
  return out;
}

export async function readDemoCase(filePath: string): Promise<DemoCaseSheets> {
  const workbook = await open(filePath);
  const sheet = (name: string) => sheetOf(workbook, name, filePath);
  return {
    offers: tableRows(sheet('Offers'), 'offer_id'),
    pcf: tableRows(sheet('PCF'), 'pcf_id'),
    sources: tableRows(sheet('Sources'), 'source_id'),
    categories: tableRows(sheet('Categories'), 'category'),
    request: keyValues(sheet('Demo Request')),
    assumptions: keyValues(sheet('Assumptions')),
  };
}
