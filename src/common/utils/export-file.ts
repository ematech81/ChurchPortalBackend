import * as ExcelJS from 'exceljs';

export interface ExportFile {
  filename: string;
  mimeType: string;
  /** File content, base64. The mobile app writes it to disk and opens the share sheet. */
  base64: string;
  size: number;
}

export const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  vcf: 'text/vcard; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
} as const;

/** Safe filename stem: ascii letters/digits/dash, no path characters. */
export function safeFilename(stem: string, ext: string): string {
  const clean = stem.normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'export';
  const date = new Date().toISOString().slice(0, 10);
  return `${clean}-${date}.${ext}`;
}

export function toExportFile(filename: string, mimeType: string, data: Buffer | string): ExportFile {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return { filename, mimeType, base64: buf.toString('base64'), size: buf.length };
}

/**
 * CSV formula injection: a cell that starts with = + - @ (or tab/CR) is executed as a formula when
 * the file is opened in Excel. User-entered text (names, form answers) gets a leading apostrophe.
 * `trusted` cells (values we generated ourselves, e.g. +234 phone numbers) are left untouched.
 */
function csvCell(value: unknown, trusted: boolean): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (!trusted && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 with BOM (so Excel shows names with accents correctly) and CRLF line endings. */
export function buildCsv(headers: string[], rows: unknown[][], trustedColumns: number[] = []): string {
  const trusted = new Set(trustedColumns);
  const lines = [headers.map((h) => csvCell(h, true)).join(',')];
  for (const row of rows) lines.push(row.map((v, i) => csvCell(v, trusted.has(i))).join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/**
 * Excel file. Every value is written as TEXT: strings are never evaluated as formulas, and phone
 * numbers keep their leading + / 0 instead of being turned into numbers.
 */
export async function buildXlsx(sheetName: string, headers: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kingdom Portal';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.replace(/[\\/*?:\[\]]/g, ' ').slice(0, 31) || 'Sheet1');

  ws.addRow(headers);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF120D2E' } };
  head.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of rows) {
    const r = ws.addRow(row.map((v) => (v === null || v === undefined ? '' : String(v))));
    r.eachCell((cell) => {
      cell.numFmt = '@'; // text
    });
  }

  headers.forEach((h, i) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), h.length);
    ws.getColumn(i + 1).width = Math.min(Math.max(longest + 2, 10), 50);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** vCard 3.0 — phones import it as contacts (handy for WhatsApp broadcast lists). */
export function buildVcf(contacts: { name: string; phone: string }[]): string {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  return contacts
    .map((c) => {
      const parts = c.name.trim().split(/\s+/);
      const last = parts.length > 1 ? parts.pop()! : '';
      const first = parts.join(' ');
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${esc(last)};${esc(first)};;;`,
        `FN:${esc(c.name.trim())}`,
        `TEL;TYPE=CELL:${c.phone}`,
        'END:VCARD',
      ].join('\r\n');
    })
    .join('\r\n') + '\r\n';
}
