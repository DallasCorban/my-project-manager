// useScrollToToday — scrolls the Gantt container to center on today's column.

import { useCallback, type RefObject } from 'react';
import type { TimelineDay } from '../types/timeline';

/**
 * Hook that provides a function to scroll the Gantt body to center on today.
 */
export function useScrollToToday(
  bodyRef: RefObject<HTMLDivElement | null>,
  visibleDays: TimelineDay[],
  zoomLevel: number,
) {
  const scrollToToday = useCallback((smooth = true) => {
    const el = bodyRef.current;
    if (!el) return;

    // When weekends are hidden, today might be filtered out of visibleDays
    // (e.g. if today is Saturday/Sunday). Fall back to the nearest visible day.
    const todayVisualIndex = visibleDays.findIndex((d) => d.index >= 0);
    if (todayVisualIndex < 0) return;

    const todayPixel = todayVisualIndex * zoomLevel;
    const containerWidth = el.clientWidth;
    // Subtract the label column width (320px) then center
    const labelColumnWidth = 320;
    const viewportWidth = containerWidth - labelColumnWidth;
    const targetScroll = Math.max(0, todayPixel - viewportWidth / 2);

    el.scrollTo({ left: targetScroll, behavior: smooth ? 'smooth' : 'auto' });
  }, [bodyRef, visibleDays, zoomLevel]);

  return scrollToToday;
}
