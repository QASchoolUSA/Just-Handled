import { startOfWeek, startOfMonth, format } from "date-fns";

export type PeriodBucket = "week" | "month";

function isValidDate(d: Date): boolean {
  return Number.isFinite(d.getTime());
}

export function getBucketStart(dateStr: string, bucket: PeriodBucket): string {
  const d = new Date(dateStr);
  if (!isValidDate(d)) return "";
  const start = bucket === "week" ? startOfWeek(d, { weekStartsOn: 0 }) : startOfMonth(d);
  return format(start, "yyyy-MM-dd");
}

export interface TimeBucketItem {
  period: string;
  periodLabel: string;
}

/**
 * Group items by time period (week or month). Each item must have a date string (e.g. deliveryDate, date).
 */
export function groupByPeriod<T>(
  items: T[],
  getDate: (item: T) => string,
  bucket: PeriodBucket
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const dateStr = getDate(item);
    if (!dateStr) continue;
    const key = getBucketStart(dateStr, bucket);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

/**
 * Get sorted period keys (oldest first) for a date range. Useful for ensuring all periods appear on the chart.
 */
export function getPeriodKeysFromRange(
  startDate: Date,
  endDate: Date,
  bucket: PeriodBucket
): string[] {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return [];
  const keys: string[] = [];
  const start = bucket === "week"
    ? startOfWeek(startDate, { weekStartsOn: 0 })
    : startOfMonth(startDate);
  const end = bucket === "week"
    ? startOfWeek(endDate, { weekStartsOn: 0 })
    : startOfMonth(endDate);
  let current = new Date(start);
  while (current <= end) {
    keys.push(format(current, "yyyy-MM-dd"));
    if (bucket === "week") {
      current.setDate(current.getDate() + 7);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }
  return keys;
}

/**
 * Build chart data array: one row per period with period, periodLabel, and optional value keys.
 * Period keys are always "yyyy-MM-dd" (e.g. "2024-03-01" for month, "2024-03-10" for week start).
 */
export function buildChartDataFromBuckets(
  periodKeys: string[],
  bucket: PeriodBucket
): { period: string; periodLabel: string }[] {
  return periodKeys.map((period) => {
    const d = new Date(period);
    const valid = isValidDate(d);
    let periodLabel: string;
    if (!valid) {
      periodLabel = period || "—";
    } else if (bucket === "month") {
      periodLabel = format(d, "MMM yyyy");
    } else {
      const next = new Date(d);
      next.setDate(next.getDate() + 6);
      periodLabel = `${format(d, "MMM d")} – ${format(next, "MMM d")}`;
    }
    return { period, periodLabel };
  });
}
