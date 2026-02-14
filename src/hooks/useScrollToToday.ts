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
  const scrollToToday = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;

    const todayVisualIndex = visibleDays.findIndex((d) => d.isToday);
    if (todayVisualIndex < 0) return;

    const todayPixel = todayVisualIndex * zoomLevel;
    const containerWidth = el.clientWidth;
    // Subtract the label column width (320px) then center
    const labelColumnWidth = 320;
    const viewportWidth = containerWidth - labelColumnWidth;
    const targetScroll = todayPixel - viewportWidth / 2;

    el.scrollLeft = Math.max(0, targetScroll);
  }, [bodyRef, visibleDays, zoomLevel]);

  return scrollToToday;
}
