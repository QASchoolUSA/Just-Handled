import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parse } from "date-fns";
import type { Load, Driver } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}


export function downloadCsv(csvString: string, filename: string) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function toTitleCase(str: string) {
  return str.replace(
    /\w\S*/g,
    text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
}

export function formatPhoneNumber(phoneNumber: string | undefined | null) {
  if (!phoneNumber) return '';
  const cleaned = ('' + phoneNumber).replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    return '(' + match[1] + ') ' + match[2] + '-' + match[3];
  }
  return phoneNumber;
}

export function parseNumber(value: string | number | undefined | null): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  // Remove currency symbols, commas, whitespace
  const cleaned = String(value).replace(/[$,\s]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function normalizeDateFormat(dateStr: string): string {
  if (!dateStr) return '';
  // Try to parse varies formats.
  // Expected input: 'MM/DD/YYYY' or 'YYYY-MM-DD' or 'D-MMM-YY'
  const trimmed = dateStr.trim();

  // Already ISO? (Simple check)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Handle D-MMM-YY (e.g. 1-Oct-23)
  if (/\d{1,2}-[a-zA-Z]{3}-\d{2}/.test(trimmed)) {
    try {
      const parsed = parse(trimmed, 'd-MMM-yy', new Date()); // Requires date-fns import? Or native? 
      // Wait, utils.ts doesn't import date-fns. I should import it or use native.
      // Native is unreliable for 'd-MMM-yy'. I'll stick to a simpler implementation or import date-fns.
      // Let's check imports in utils again. It has none.
      // I'll import parse and format from date-fns in utils.ts
      return format(parsed, 'yyyy-MM-dd');
    } catch (e) {
      // Fallback
    }
  }

  // Handle MM/DD/YYYY
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const [m, d, y] = parts;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Fallback: try Date.parse (risky for local timezones but acceptable for simple strings)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return trimmed; // Return original if failure
}

export function calculateDriverPay(load: Load, driver?: Driver) {
  if (!driver) return 0;
  const rate = parseNumber(driver.rate);
  const payType = driver.payType;
  if (payType != 'percentage' && payType != 'cpm') {
    return parseNumber(load.extraStopsPay);
  }
  if (rate === 0) {
    return parseNumber(load.extraStopsPay);
  }
  let base: number;
  if (payType === 'percentage') {
    base = parseNumber(load.invoiceAmount) * rate;
  } else {
    base = parseNumber(load.miles) * rate;
  }
  const extraPay = parseNumber(load.extraStopsPay);
  return base + extraPay;
}
