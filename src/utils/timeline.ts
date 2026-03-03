import type { TimelineDay } from '../types/timeline';
import { getTodayKey, fromLocalDateKey } from './date';
import { PAST_DAYS, TIMELINE_TOTAL_DAYS } from '../config/constants';

/**
 * Generate timeline day data for the Gantt chart.
 * Creates an array spanning from PAST_DAYS before today to FUTURE_DAYS after today.
 */
export const generateTimelineData = (): TimelineDay[] => {
  const todayKey = getTodayKey();
  const today = fromLocalDateKey(todayKey)!;
  const days: TimelineDay[] = [];
  const start = new Date(today);
  start.setDate(today.getDate() - PAST_DAYS);

  for (let i = 0; i < TIMELINE_TOTAL_DAYS; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const relativeIndex = i - PAST_DAYS;
    const dayNum = date.getDate();
    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const dayOfWeek = date.getDay();
    const isMonday = dayOfWeek === 1;

    let weekLabel = '';
    if (isMonday) {
      const friday = new Date(date);
      friday.setDate(date.getDate() + 4);
      weekLabel = `${date.getDate()} - ${friday.getDate()}`;
    }

    days.push({
      index: relativeIndex,
      dayNum,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      monthName,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isMonday,
      isToday: relativeIndex === 0,
      weekLabel,
    });
  }

  return days;
};

/**
 * Calculate the actual calendar duration (in days) given a visual span,
 * accounting for hidden weekends.
 */
export const calculateCalendarDuration = (
  startDateIndex: number,
  visualSpan: number,
  rawDays: TimelineDay[],
  showWeekends: boolean,
): number => {
  let currentRelIndex = startDateIndex;
  let visibleDaysCounted = 0;
  let loopSafety = 0;

  while (visibleDaysCounted < visualSpan && loopSafety < 3650) {
    loopSafety++;
    const arrayIndex = currentRelIndex + PAST_DAYS;
    if (arrayIndex < 0 || arrayIndex >= rawDays.length) break;
    const day = rawDays[arrayIndex];
    if (day) {
      if (showWeekends || !day.isWeekend) visibleDaysCounted++;
    }
    currentRelIndex++;
  }

  return Math.max(1, currentRelIndex - startDateIndex);
};
