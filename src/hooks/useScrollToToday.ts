// useScrollToToday — scrolls the Gantt container to center on today's column.

import { useCallback, type RefObject } from 'react';
import type { TimelineDay } from '../types/timeline';

/** Ease-in-out cubic — smooth deceleration at both ends. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Animate horizontal scroll on `el` from its current position to `targetLeft`. */
function animateScrollLeft(el: HTMLElement, targetLeft: number, duration = 500) {
  const startLeft = el.scrollLeft;
  const delta = targetLeft - startLeft;
  if (delta === 0) return;

  const startTime = performance.now();

  function step(now: number) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    el.scrollLeft = startLeft + delta * easeInOutCubic(progress);
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

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
    const labelColumnWidth = 320;
    const viewportWidth = containerWidth - labelColumnWidth;
    const targetScroll = Math.max(0, todayPixel - viewportWidth / 2);

    if (smooth) {
      animateScrollLeft(el, targetScroll);
    } else {
      el.scrollLeft = targetScroll;
    }
  }, [bodyRef, visibleDays, zoomLevel]);

  return scrollToToday;
}
