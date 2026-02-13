// src/utils/date.js

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Format Date -> YYYY-MM-DD (local)
export const toLocalDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Parse YYYY-MM-DD -> local midnight Date
export const fromLocalDateKey = (key) => {
  if (!key || !DATE_KEY_RE.test(String(key))) return null;
  const [y, m, d] = String(key).split("-").map((x) => Number(x));
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export const isDateKey = (value) => DATE_KEY_RE.test(String(value || ""));

export const getTodayKey = () => toLocalDateKey(new Date());

export const normalizeDateKey = (value) => {
  if (!value) return null;
  if (isDateKey(value)) return String(value);
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : toLocalDateKey(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (DATE_KEY_RE.test(trimmed)) return trimmed;
    const isoPrefix = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoPrefix && DATE_KEY_RE.test(isoPrefix[0])) return isoPrefix[0];
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : toLocalDateKey(parsed);
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const dt = value.toDate();
      return dt && !Number.isNaN(dt.getTime()) ? toLocalDateKey(dt) : null;
    }
    if (typeof value.seconds === "number") {
      const ms = value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6);
      const dt = new Date(ms);
      return Number.isNaN(dt.getTime()) ? null : toLocalDateKey(dt);
    }
  }
  return null;
};

export const addDaysToKey = (key, days) => {
  const baseKey = normalizeDateKey(key);
  const dt = fromLocalDateKey(baseKey);
  if (!dt) return null;
  dt.setDate(dt.getDate() + Number(days || 0));
  return toLocalDateKey(dt);
};

export const diffDays = (fromKey, toKey) => {
  const from = fromLocalDateKey(normalizeDateKey(fromKey));
  const to = fromLocalDateKey(normalizeDateKey(toKey));
  if (!from || !to) return null;
  return Math.round((to - from) / MS_PER_DAY);
};

export const formatDateKey = (key, locale) => {
  const dt = fromLocalDateKey(normalizeDateKey(key));
  if (!dt) return "";
  return dt.toLocaleDateString(locale, { month: "short", day: "numeric" });
};

// Backwards-compatible name (now expects a date key)
export const formatDayIndex = formatDateKey;
