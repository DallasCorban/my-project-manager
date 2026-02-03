// src/utils/date.js

export const PMAI_EPOCH_ISO = "2026-01-01T00:00:00"; // fixed anchor for all stored day indexes
const EPOCH = new Date(PMAI_EPOCH_ISO);

export function dateFromDayIndex(dayIndex) {
  if (dayIndex === null || dayIndex === undefined) return null;
  const d = new Date(EPOCH);
  d.setDate(d.getDate() + Number(dayIndex || 0));
  return d;
}

export function dayIndexFromDate(date) {
  if (!date) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = date - EPOCH;
  return Math.round(diff / msPerDay);
}

export function formatDayIndex(dayIndex, locale) {
  const d = dateFromDayIndex(dayIndex);
  if (!d) return null;
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}
