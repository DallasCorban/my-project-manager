// useTimeline — computes visible days, months, and index mappings for the Gantt view.
// Memoizes expensive timeline calculations based on showWeekends setting.

import { useMemo } from 'react';
import type { TimelineDay } from '../types/timeline';
import { generateTimelineData } from '../utils/timeline';

export interface MonthGroup {
  name: string;
  count: number;
}

export interface UseTimelineResult {
  /** All generated timeline days (including weekends) */
  rawDays: TimelineDay[];
  /** Days visible in the Gantt (weekends filtered when hidden) */
  visibleDays: TimelineDay[];
  /** Month groups with counts for header row */
  visibleMonths: MonthGroup[];
  /** Map from raw day index → visual index (position in visibleDays) */
  dayToVisualIndex: Record<number, number>;
  /** Map from visual index → raw day index */
  visualIndexToDayIndex: Record<number, number>;
  /** Get the relative index (from today) for a date key. Returns null for invalid/missing keys. */
  getRelativeIndex: (dateKey: string | null | undefined) => number | null;
}

/**
 * Hook for computing visible timeline data.
 * Filters weekends when showWeekends is false.
 * Returns mappings between raw and visual indices for bar positioning.
 */
export function useTimeline(showWeekends: boolean): UseTimelineResult {
  const rawDays = useMemo(() => generateTimelineData(), []);

  const { visibleDays, visibleMonths, dayToVisualIndex, visualIndexToDayIndex } = useMemo(() => {
    // Filter out weekends if hidden
    const visible = showWeekends ? rawDays : rawDays.filter((d) => !d.isWeekend);

    // Build index mappings
    const dToV: Record<number, number> = {};
    const vToD: Record<number, number> = {};
    visible.forEach((day, vi) => {
      dToV[day.index] = vi;
      vToD[vi] = day.index;
    });

    // Group into months for header
    const months: MonthGroup[] = [];
    let currentMonth = '';
    for (const day of visible) {
      if (day.monthName !== currentMonth) {
        months.push({ name: day.monthName, count: 1 });
        currentMonth = day.monthName;
      } else {
        months[months.length - 1].count++;
      }
    }

    return {
      visibleDays: visible,
      visibleMonths: months,
      dayToVisualIndex: dToV,
      visualIndexToDayIndex: vToD,
    };
  }, [rawDays, showWeekends]);

  /**
   * Get relative index from today for a date key.
   * Uses Date arithmetic: relativeIndex = diffDays(today, dateKey).
   * The returned value maps into dayToVisualIndex.
   */
  const getRelativeIndex = useMemo(() => {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msPerDay = 1000 * 60 * 60 * 24;

    return (dateKey: string | null | undefined): number | null => {
      if (!dateKey) return null;
      const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Math.round((target.getTime() - todayMidnight.getTime()) / msPerDay);
    };
  }, []);

  return {
    rawDays,
    visibleDays,
    visibleMonths,
    dayToVisualIndex,
    visualIndexToDayIndex,
    getRelativeIndex,
  };
}
