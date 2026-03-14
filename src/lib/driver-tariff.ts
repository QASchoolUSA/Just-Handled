/**
 * Parse driver pay from a single "tariff" column, e.g.:
 * - ".60 cpm", "0.60 cpm", "60 cpm" → { payType: 'cpm', rate: 0.6 }
 * - "30%", "30% from gross", "30% of gross" → { payType: 'percentage', rate: 0.3 }
 */

export type DriverPayParsed = { payType: 'percentage' | 'cpm'; rate: number } | null;

export function parseDriverTariff(value: unknown): DriverPayParsed {
  const s = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!s) return null;

  const lower = s.toLowerCase();

  // Percentage: "30%", "30% from gross", "30 %"
  const pctMatch = s.match(/(\d+(?:\.\d+)?)\s*%\s*(?:from\s+gross|of\s+gross|gross)?/i) ?? lower.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const num = parseFloat(pctMatch[1]);
    if (!Number.isNaN(num) && num >= 0 && num <= 100) {
      return { payType: 'percentage', rate: num / 100 };
    }
  }

  // CPM: ".60 cpm", "0.60 cpm", "60 cpm"
  const cpmMatch = lower.match(/(\d+(?:\.\d+)?)\s*cpm/) ?? lower.match(/(\.\d+)\s*cpm/);
  if (cpmMatch) {
    const num = parseFloat(cpmMatch[1]);
    if (!Number.isNaN(num) && num >= 0) {
      return { payType: 'cpm', rate: num };
    }
  }

  return null;
}
