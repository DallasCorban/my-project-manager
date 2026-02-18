// Ported from src/utils/date.js — date key utilities for timezone-safe date handling.
// All dates are represented as YYYY-MM-DD strings ("date keys") to avoid timezone issues.

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date to a YYYY-MM-DD string using local timezone */
export const toLocalDateKey = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Parse a YYYY-MM-DD string into a local midnight Date */
export const fromLocalDateKey = (key: string | null | undefined): Date | null => {
  if (!key || !DATE_KEY_RE.test(String(key))) return null;
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

/** Check if a value is a valid YYYY-MM-DD date key */
export const isDateKey = (value: unknown): boolean =>
  DATE_KEY_RE.test(String(value || ''));

/** Get today's date as a YYYY-MM-DD key */
export const getTodayKey = (): string => toLocalDateKey(new Date());

/** Normalize various date representations to a YYYY-MM-DD key */
export const normalizeDateKey = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (DATE_KEY_RE.test(trimmed)) return trimmed;
    const isoPrefix = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoPrefix && DATE_KEY_RE.test(isoPrefix[0])) return isoPrefix[0];
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : toLocalDateKey(parsed);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toLocalDateKey(value);
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.toDate === 'function') {
      const dt = (obj.toDate as () => Date)();
      return dt && !Number.isNaN(dt.getTime()) ? toLocalDateKey(dt) : null;
    }
    if (typeof obj.seconds === 'number') {
      const ms = (obj.seconds as number) * 1000 + Math.round(((obj.nanoseconds as number) || 0) / 1e6);
      const dt = new Date(ms);
      return Number.isNaN(dt.getTime()) ? null : toLocalDateKey(dt);
    }
  }
  return null;
};

/** Add days to a date key and return a new date key */
export const addDaysToKey = (key: string | null | undefined, days: number): string | null => {
  const baseKey = normalizeDateKey(key);
  const dt = fromLocalDateKey(baseKey);
  if (!dt) return null;
  dt.setDate(dt.getDate() + (Number(days) || 0));
  return toLocalDateKey(dt);
};

/** Calculate the difference in days between two date keys */
export const diffDays = (fromKey: unknown, toKey: unknown): number | null => {
  const from = fromLocalDateKey(normalizeDateKey(fromKey));
  const to = fromLocalDateKey(normalizeDateKey(toKey));
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
};

/** Format a date key for display (e.g. "Jan 15") */
export const formatDateKey = (key: unknown, locale?: string): string => {
  const dt = fromLocalDateKey(normalizeDateKey(key));
  if (!dt) return '';
  return dt.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
};

/** Backwards-compatible alias */
export const formatDayIndex = formatDateKey;
