import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { ParsedFile } from './types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const CSV_MIME = 'text/csv';
const CSV_EXT = '.csv';
const XLSX_EXT = '.xlsx';
const XLS_EXT = '.xls';

function isCsv(file: File): boolean {
  return file.type === CSV_MIME || file.name.toLowerCase().endsWith(CSV_EXT);
}

function isExcel(file: File): boolean {
  return (
    file.type === XLSX_MIME ||
    file.type === XLS_MIME ||
    file.name.toLowerCase().endsWith(XLSX_EXT) ||
    file.name.toLowerCase().endsWith(XLS_EXT)
  );
}

/** Parse CSV file to { headers, rows }. */
function parseCsv(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, unknown>[];
        const headers = results.meta.fields || (rows[0] ? Object.keys(rows[0] as object) : []);
        resolve({
          headers: Array.isArray(headers) ? headers : [],
          rows,
          fileName: file.name,
        });
      },
      error: (err) => reject(err),
    });
  });
}

/** Parse XLSX/XLS file to { headers, rows }. Uses first sheet. */
function parseExcel(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          reject(new Error('Failed to read file'));
          return;
        }
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          reject(new Error('No sheet found in workbook'));
          return;
        }
        const ws = wb.Sheets[firstSheet];
        const raw = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: '',
        }) as unknown as (string | number | null)[][];
        if (raw.length === 0) {
          resolve({ headers: [], rows: [], fileName: file.name });
          return;
        }
        const headers = raw[0].map((h) => String(h ?? '').trim());
        const rows: Record<string, unknown>[] = [];
        for (let i = 1; i < raw.length; i++) {
          const row: Record<string, unknown> = {};
          raw[i].forEach((cell, j) => {
            const key = headers[j] || `Column_${j}`;
            row[key] = cell === null || cell === undefined ? '' : cell;
          });
          rows.push(row);
        }
        resolve({ headers, rows, fileName: file.name });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse uploaded file (CSV or XLSX/XLS) into headers and rows.
 */
export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  if (isCsv(file)) return parseCsv(file);
  if (isExcel(file)) return parseExcel(file);
  throw new Error('Unsupported file type. Please upload a CSV or Excel (.xlsx, .xls) file.');
}

export function getAcceptedFileTypes(): string {
  return '.csv,.xlsx,.xls';
}

export function getAcceptedMimeTypes(): string {
  return 'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
}
