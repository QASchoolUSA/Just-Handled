import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { ParsedFile } from "@/lib/onboarding/types";

type GridCell = unknown;
type Grid = GridCell[][];

const cellText = (cell: unknown): string => {
  if (cell == null) return "";
  return String(cell).trim();
};

const rowHasAny = (row: GridCell[], needleLower: string) => {
  const n = needleLower.toLowerCase();
  for (const cell of row) {
    const t = cellText(cell);
    if (t && t.toLowerCase().includes(n)) return true;
  }
  return false;
};

const rowHasExactCell = (row: GridCell[], exactLower: string) => {
  const n = exactLower.toLowerCase();
  for (const cell of row) {
    const t = cellText(cell);
    if (t && t.toLowerCase() === n) return true;
  }
  return false;
};

function getNonEmptyAfterIndex(row: GridCell[], startIdx: number): string | undefined {
  for (let j = startIdx + 1; j < row.length; j++) {
    const t = cellText(row[j]);
    if (t) return t;
  }
  return undefined;
}

function parseFromToFromBlock(grid: Grid, fromIdx: number): { periodFrom?: string; periodTo?: string } {
  const windowEnd = Math.min(grid.length, fromIdx + 12);
  for (let i = fromIdx; i < windowEnd; i++) {
    const row = grid[i] ?? [];
    for (let j = 0; j < row.length; j++) {
      const t = cellText(row[j]);
      if (!t) continue;
      if (t.toLowerCase() === "from") {
        const periodFrom = getNonEmptyAfterIndex(row, j);
        // find "to" in the same row
        let periodTo: string | undefined;
        for (let k = j + 1; k < row.length; k++) {
          if (cellText(row[k]).toLowerCase() === "to") {
            periodTo = getNonEmptyAfterIndex(row, k);
            break;
          }
        }
        if (periodFrom || periodTo) return { periodFrom, periodTo };
      }
    }
  }
  return {};
}

function gridIsEmptyRow(row: GridCell[]): boolean {
  for (const cell of row) {
    if (cellText(cell)) return false;
  }
  return true;
}

async function parseCsvToGrid(file: File): Promise<Grid> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: false,
      complete: (results) => {
        resolve((results.data || []) as Grid);
      },
      error: (err) => reject(err),
    });
  });
}

async function parseExcelToGrid(file: File): Promise<Grid> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          reject(new Error("Failed to read file"));
          return;
        }
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) {
          reject(new Error("No sheet found in workbook"));
          return;
        }
        const ws = wb.Sheets[firstSheet];
        const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as Grid;
        resolve(grid);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function findNextRowIndexContaining(grid: Grid, startIdx: number, needleLower: string): number {
  for (let i = startIdx; i < grid.length; i++) {
    if (rowHasAny(grid[i] ?? [], needleLower)) return i;
  }
  return -1;
}

function findNextRowIndexExact(grid: Grid, startIdx: number, exactLower: string): number {
  for (let i = startIdx; i < grid.length; i++) {
    if (rowHasExactCell(grid[i] ?? [], exactLower)) return i;
  }
  return -1;
}

function extractHeadersByIndex(row: GridCell[]): { headersByIndex: Array<{ index: number; header: string }> } {
  const headersByIndex: Array<{ index: number; header: string }> = [];
  for (let j = 0; j < row.length; j++) {
    const h = cellText(row[j]);
    if (!h) continue;
    headersByIndex.push({ index: j, header: h });
  }
  return { headersByIndex };
}

export async function parseFactoringAdvanceSchedule(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const grid: Grid = isCsv ? await parseCsvToGrid(file) : await parseExcelToGrid(file);

  const rows: Record<string, unknown>[] = [];
  const headerSet = new Set<string>();

  let blockIndex = 0;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    if (!rowHasAny(row, "advance schedule")) continue;

    const { periodFrom, periodTo } = parseFromToFromBlock(grid, i);

    const invoiceHeaderIdx = (() => {
      for (let k = i; k < Math.min(grid.length, i + 220); k++) {
        if (rowHasAny(grid[k] ?? [], "invoice number")) return k;
      }
      return -1;
    })();

    if (invoiceHeaderIdx < 0) continue;

    // The "Other Charges" section starts with a cell that equals "Other Charges" (not "Other Charges:")
    const otherChargesStartIdx = (() => {
      for (let k = invoiceHeaderIdx; k < Math.min(grid.length, i + 500); k++) {
        if (rowHasExactCell(grid[k] ?? [], "other charges")) return k;
      }
      return -1;
    })();

    const blockNextAdvanceIdx = (() => findNextRowIndexContaining(grid, i + 1, "advance schedule"))();
    const invoiceEndIdx = otherChargesStartIdx >= 0 ? otherChargesStartIdx : blockNextAdvanceIdx >= 0 ? blockNextAdvanceIdx : grid.length;

    // 1) Invoices rows
    const invoiceHeaderRow = grid[invoiceHeaderIdx] ?? [];
    const { headersByIndex: invoiceHeaders } = extractHeadersByIndex(invoiceHeaderRow);
    for (const h of invoiceHeaders) headerSet.add(h.header);

    for (let k = invoiceHeaderIdx + 1; k < invoiceEndIdx; k++) {
      const dataRow = grid[k] ?? [];
      if (gridIsEmptyRow(dataRow)) continue;

      const record: Record<string, unknown> = {
        __rowKind: "invoice",
        __blockIndex: blockIndex,
        __periodFrom: periodFrom ?? "",
        __periodTo: periodTo ?? "",
      };

      for (const h of invoiceHeaders) {
        record[h.header] = dataRow[h.index] ?? "";
      }
      rows.push(record);
    }

    // 2) Other charges rows (optional)
    if (otherChargesStartIdx >= 0) {
      const otherChargesTableHeaderIdx = (() => {
        for (let k = otherChargesStartIdx; k < Math.min(grid.length, otherChargesStartIdx + 40); k++) {
          const r = grid[k] ?? [];
          const hasDate = rowHasAny(r, "date");
          const hasDesc = rowHasAny(r, "description");
          const hasAmount = rowHasAny(r, "amount");
          // Avoid accidentally matching invoice header rows by requiring the presence of "Other Charges" nearby.
          if (hasDate && hasDesc && hasAmount) return k;
        }
        return -1;
      })();

      const netCheckIdx = (() => {
        if (otherChargesTableHeaderIdx < 0) return -1;
        for (let k = otherChargesTableHeaderIdx; k < Math.min(grid.length, otherChargesTableHeaderIdx + 80); k++) {
          if (rowHasAny(grid[k] ?? [], "net check")) return k;
        }
        return -1;
      })();

      if (otherChargesTableHeaderIdx >= 0 && netCheckIdx > otherChargesTableHeaderIdx) {
        const otherHeaderRow = grid[otherChargesTableHeaderIdx] ?? [];
        const { headersByIndex: otherHeaders } = extractHeadersByIndex(otherHeaderRow);
        for (const h of otherHeaders) headerSet.add(h.header);

        for (let k = otherChargesTableHeaderIdx + 1; k < netCheckIdx; k++) {
          const dataRow = grid[k] ?? [];
          if (gridIsEmptyRow(dataRow)) continue;

          const record: Record<string, unknown> = {
            __rowKind: "otherCharge",
            __blockIndex: blockIndex,
            __periodFrom: periodFrom ?? "",
            __periodTo: periodTo ?? "",
          };

          for (const h of otherHeaders) {
            record[h.header] = dataRow[h.index] ?? "";
          }

          rows.push(record);
        }
      }
    }

    blockIndex++;
    // Continue scanning from where the block likely ends
    i = Math.max(i, invoiceEndIdx);
  }

  return {
    headers: Array.from(headerSet),
    rows,
    fileName: file.name,
  };
}

