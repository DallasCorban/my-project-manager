// src/utils/date.js

const BASE_DATE_KEY = "pmai_baseDate";

// Format Date -> YYYY-MM-DD (local)
const toLocalDateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Parse YYYY-MM-DD -> local midnight Date
const fromLocalDateKey = (key) => {
  const [y, m, d] = String(key).split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const getBaseDate = () => {
  if (typeof window === "undefined") return new Date(2026, 0, 1);
  try {
    const saved = window.localStorage.getItem(BASE_DATE_KEY);
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      const dt = fromLocalDateKey(saved);
      if (dt) return dt;
    }
    if (saved) {
      const parsed = new Date(saved);
      if (!Number.isNaN(parsed.getTime())) {
        const migratedKey = toLocalDateKey(parsed);
        window.localStorage.setItem(BASE_DATE_KEY, migratedKey);
        const dt = fromLocalDateKey(migratedKey);
        if (dt) return dt;
      }
    }
    const todayKey = toLocalDateKey(new Date());
    window.localStorage.setItem(BASE_DATE_KEY, todayKey);
    return fromLocalDateKey(todayKey) || new Date();
  } catch {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
};

const getEpoch = () => getBaseDate();

export function dateFromDayIndex(dayIndex) {
  if (dayIndex === null || dayIndex === undefined) return null;
  const d = new Date(getEpoch());
  d.setDate(d.getDate() + Number(dayIndex || 0));
  return d;
}

export function dayIndexFromDate(date) {
  if (!date) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = date - getEpoch();
  return Math.round(diff / msPerDay);
}

export function formatDayIndex(dayIndex, locale) {
  const d = dateFromDayIndex(dayIndex);
  if (!d) return null;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
