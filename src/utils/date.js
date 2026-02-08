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

export const addDaysToKey = (key, days) => {
  const dt = fromLocalDateKey(key);
  if (!dt) return null;
  dt.setDate(dt.getDate() + Number(days || 0));
  return toLocalDateKey(dt);
};

export const diffDays = (fromKey, toKey) => {
  const from = fromLocalDateKey(fromKey);
  const to = fromLocalDateKey(toKey);
  if (!from || !to) return null;
  return Math.round((to - from) / MS_PER_DAY);
};

export const formatDateKey = (key, locale) => {
  const dt = fromLocalDateKey(key);
  if (!dt) return null;
  return dt.toLocaleDateString(locale, { month: "short", day: "numeric" });
};

// Backwards-compatible name (now expects a date key)
export const formatDayIndex = formatDateKey;
