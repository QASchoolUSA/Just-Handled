import { format } from 'date-fns';
import { parse } from 'date-fns';
import type { ColumnMapping, NormalizedRow } from './types';
import type { ParsedFile } from './types';
import { parseDriverTariff } from '@/lib/driver-tariff';

function parseNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).replace(/[$,\s]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function normalizeDate(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const formats = [
    'MMM d, yyyy',
    'MMM dd, yyyy',
    'M/d/yyyy',
    'M/d/yy',
    'MM/dd/yyyy',
    'yyyy-MM-dd',
    'dd-MMM-yy',
    'd-MMM-yy',
  ];
  for (const fmt of formats) {
    try {
      const p = parse(s, fmt, new Date());
      if (!isNaN(p.getTime())) return format(p, 'yyyy-MM-dd');
    } catch {
      continue;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
  return '';
}

/** Resolve mapping value to actual row key (handles __empty_N__ sentinel for empty headers). */
function resolveColumnKey(mappingValue: string | undefined, headers: string[]): string | undefined {
  if (mappingValue == null || mappingValue === '') return undefined;
  const match = mappingValue.match(/^__empty_(\d+)__$/);
  if (match) {
    const i = parseInt(match[1], 10);
    return headers[i];
  }
  return mappingValue;
}

function getCell(row: Record<string, unknown>, fileColumn: string): unknown {
  if (fileColumn === undefined || fileColumn === null) return undefined;
  const key = String(fileColumn);
  if (row[key] !== undefined) return row[key];
  const lower = String(key).toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return undefined;
}

/**
 * Apply column mapping to parsed file and normalize types.
 * Rows missing required fields (loadNumber, driver, pickupDate, deliveryDate) are skipped.
 */
export function normalizeRows(parsed: ParsedFile, mapping: ColumnMapping): NormalizedRow[] {
  const result: NormalizedRow[] = [];
  const defaultDate = format(new Date(), 'yyyy-MM-dd');
  const headers = parsed.headers;

  for (const row of parsed.rows) {
    const loadNumberKey = resolveColumnKey(mapping.loadNumber, headers);
    const driverKey = resolveColumnKey(mapping.driver, headers);
    const pickupDateKey = resolveColumnKey(mapping.pickupDate, headers);
    const deliveryDateKey = resolveColumnKey(mapping.deliveryDate, headers);

    const loadNumber = loadNumberKey != null ? String(getCell(row, loadNumberKey) ?? '').trim() : '';
    const driverName = driverKey != null ? String(getCell(row, driverKey) ?? '').trim() : '';
    const pickupDate =
      pickupDateKey != null ? normalizeDate(getCell(row, pickupDateKey)) || defaultDate : defaultDate;
    const deliveryDate =
      deliveryDateKey != null ? normalizeDate(getCell(row, deliveryDateKey)) || defaultDate : defaultDate;

    if (!loadNumber || !driverName) continue;

    const get = (field: keyof ColumnMapping) => {
      const key = resolveColumnKey(mapping[field], headers);
      return key != null ? getCell(row, key) : undefined;
    };

    // Driver pay: prefer driverPayType + driverRate; else parse driverTariff (e.g. ".60 cpm" or "30% from gross")
    let payType: NormalizedRow['payType'];
    let rate: NormalizedRow['rate'];
    if (mapping.driverPayType && mapping.driverRate) {
      const pt = String(get('driverPayType') ?? '').trim().toLowerCase();
      const r = parseNumber(get('driverRate'));
      if (pt && (pt === 'cpm' || pt === 'percentage') && r >= 0) {
        payType = pt as 'percentage' | 'cpm';
        // Percentage: if value > 1 treat as percentage points (e.g. 30 → 0.30), else as decimal (0.25)
        rate = pt === 'percentage' ? (r > 1 ? r / 100 : r) : r;
      }
    }
    if (payType == null && mapping.driverTariff) {
      const parsed = parseDriverTariff(get('driverTariff'));
      if (parsed) {
        payType = parsed.payType;
        rate = parsed.rate;
      }
    }

    result.push({
      loadNumber,
      driverName,
      driverEmail: mapping.driverEmail ? String(get('driverEmail') ?? '').trim() || undefined : undefined,
      driverPhone: mapping.driverPhone ? String(get('driverPhone') ?? '').trim() || undefined : undefined,
      pickupDate,
      deliveryDate,
      customer: mapping.customer ? String(get('customer') ?? '').trim() || undefined : undefined,
      truckId: mapping.truckId ? String(get('truckId') ?? '').trim() || undefined : undefined,
      trailerNumber: mapping.trailerNumber ? String(get('trailerNumber') ?? '').trim() || undefined : undefined,
      pickupLocation: mapping.pickupLocation ? String(get('pickupLocation') ?? '').trim() || undefined : undefined,
      deliveryLocation: mapping.deliveryLocation ? String(get('deliveryLocation') ?? '').trim() || undefined : undefined,
      extraStops: mapping.extraStops ? parseNumber(get('extraStops')) || undefined : undefined,
      invoiceAmount: mapping.invoiceAmount ? parseNumber(get('invoiceAmount')) || undefined : undefined,
      totalPay: mapping.totalPay ? parseNumber(get('totalPay')) || undefined : undefined,
      miles: mapping.miles ? parseNumber(get('miles')) || undefined : undefined,
      ...(payType != null && rate != null ? { payType, rate } : {}),
    });
  }

  return result;
}
