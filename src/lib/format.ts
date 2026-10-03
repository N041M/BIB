import { BRAND } from '../config';

const money = new Intl.NumberFormat(BRAND.locale, {
  style: 'currency',
  currency: BRAND.currency,
  minimumFractionDigits: 2,
});

export const formatPrice = (value: number): string => (value === 0 ? 'FREE' : money.format(value));
export const formatMoney = (value: number): string => money.format(value);

export const formatInt = (value: number): string => value.toLocaleString('en-US');

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const pad = (value: number, length = 2): string => String(Math.floor(value)).padStart(length, '0');

/**
 * Gothic-calendar stamp: check digit, fraction of the year (000–999),
 * year within the millennium and the millennium itself — e.g. `0.756.026.M3`.
 */
export function archiveDate(date = new Date()): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const end = Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  const fraction = Math.floor(((date.getTime() - start) / (end - start)) * 1000);
  const year = date.getUTCFullYear() % 1000;
  const millennium = Math.floor(date.getUTCFullYear() / 1000) + 1;
  return `0.${pad(fraction, 3)}.${pad(year, 3)}.M${millennium}`;
}

export function clock(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
