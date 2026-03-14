import type { ParsedFile } from '@/lib/onboarding/types';

/** Column mapping: system field id -> file column header (or __empty_N__ for empty header at index N). */
export type ColumnMapping = Partial<Record<string, string>>;

export type ImportMappingConfig = {
  /** System field ids to show in the mapping form (order preserved). */
  systemFields: readonly string[];
  /** Field ids that must be mapped for import to be allowed. */
  requiredFields: readonly string[];
  /** Human-readable label per system field. */
  fieldLabels: Record<string, string>;
};

/** Resolve mapping value to actual row key (handles __empty_N__ for empty headers). */
export function resolveMappedKey(mappingValue: string | undefined, headers: string[]): string | undefined {
  if (mappingValue == null || mappingValue === '') return undefined;
  const match = mappingValue.match(/^__empty_(\d+)__$/);
  if (match) {
    const i = parseInt(match[1], 10);
    return headers[i] ?? `Column_${i}`;
  }
  return mappingValue;
}

/** Get cell value from a row using the column mapping. */
export function getMappedCell(
  row: Record<string, unknown>,
  fieldId: string,
  mapping: ColumnMapping,
  headers: string[]
): unknown {
  const key = resolveMappedKey(mapping[fieldId], headers);
  if (key == null) return undefined;
  if (row[key] !== undefined) return row[key];
  const lower = String(key).toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return undefined;
}

/** Check if required fields are mapped and at least one row exists. */
export function canImportWithMapping(
  parsed: ParsedFile,
  mapping: ColumnMapping,
  config: ImportMappingConfig
): boolean {
  if (!parsed.rows.length) return false;
  return config.requiredFields.every((f) => {
    const v = mapping[f];
    return v != null && String(v).trim() !== '' && String(v).trim() !== '__none__';
  });
}

const SENTINEL_NONE = '__none__';
export { SENTINEL_NONE };
