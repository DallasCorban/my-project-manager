// useSmartSensors — shared dnd-kit sensor configuration for Board and Gantt.
//
// SmartPointerSensor: extends PointerSensor but refuses to activate a drag
// when the initial pointer-down lands on an interactive element (inputs,
// buttons, contenteditable, or anything marked data-no-dnd). This prevents
// accidental drags when the user is clicking to edit a task name or pressing
// a button.
//
// useSortableSensors: convenience hook — returns the configured sensors array
// (SmartPointerSensor with 4px distance constraint + KeyboardSensor for a11y).
//
// sortableCollisionDetection: custom collision detection function.
//   - Filters droppable candidates to the same type as the active item (task,
//     subitem, or group) so that a task drag can never accidentally land on a
//     group droppable and vice-versa.
//   - Does NOT exclude the active item's own droppable. With MeasuringStrategy.Always
//     the active item's droppable rect is continuously re-measured to its current
//     visual (transformed) position — i.e. exactly where the gap is. If the ghost
//     overlaps that position, over.id === active.id, which tells dnd-kit "stay put,
//     gap doesn't move". Excluding it would create a blind spot at the gap, causing
//     the closestCenter fallback to fire and jump to the wrong neighbour — which is
//     the "can't return to original spot / skips a place" bug.
//   - Uses overlap-threshold detection as the primary algorithm: a swap fires
//     when the ghost rect overlaps a candidate row by ≥ 25% of that row's height.
//     This sits between pointerWithin (0% → jitter at boundaries) and closestCenter
//     (~50% overshoot → feels sluggish). It directly maps to the intended UX:
//     "when the ghost overlaps the adjacent ticket enough, that ticket slides out
//     of the way."
//   - Falls back to closestCenter when no candidate meets the threshold (e.g.
//     ghost near the scroll edge or between groups).

import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    'input, button, select, textarea, [contenteditable="true"], [data-no-dnd]',
  );
}

export class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: { nativeEvent: PointerEvent }) =>
        !isInteractive(nativeEvent.target),
    },
  ];
}

export function useSortableSensors() {
  return useSensors(
    // 4px distance: enough to ignore accidental micro-movements but low enough
    // that short drags (e.g. moving the last item up one slot) register reliably.
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * Custom collision detection for Board + Gantt sortable lists.
 *
 * Implements the "overlap-threshold" algorithm:
 *   A swap fires when the ghost rect overlaps a candidate row by at least
 *   OVERLAP_RATIO (25%) of that row's height. This matches the intended UX:
 *   "when my ghost overlaps the adjacent ticket enough, that ticket slides to
 *   make space."
 *
 * Why not pointerWithin?  Fires at 0% overlap — jitter at row boundaries.
 * Why not closestCenter?  Fires at ~50% overshoot — feels sluggish.
 *
 * Active item included in candidates:
 *   With MeasuringStrategy.Always the active item's droppable rect is
 *   continuously re-measured to its current visual (transformed) position —
 *   i.e. exactly where the gap is. Returning over.id === active.id tells
 *   dnd-kit "ghost is over the gap, stay put". Excluding the active item would
 *   create a blind spot there, causing the closestCenter fallback to fire
 *   incorrectly and producing the "can't return to original slot / skips a
 *   position" bug.
 *
 * Type-filtered candidates:
 *   Only same-type droppables are considered (task vs. subitem vs. group),
 *   preventing cross-type collisions.
 *
 * closestCenter fallback:
 *   Used when no candidate meets the overlap threshold (ghost near scroll edge
 *   or between groups).
 */

// Fraction of a row's height the ghost must overlap before the row slides.
// 0.25 → 10 px for a 40 px row; tweak if the feel needs adjusting.
const OVERLAP_RATIO = 0.25;

export const sortableCollisionDetection: CollisionDetection = (args) => {
  const { active, collisionRect, droppableRects, droppableContainers } = args;
  const activeType = (active.data.current as { type?: string } | undefined)?.type;

  // Filter: same type only. Active item's own droppable is intentionally kept
  // in the candidate list (see JSDoc above).
  const candidates = activeType
    ? droppableContainers.filter(
        (c) => (c.data.current as { type?: string } | undefined)?.type === activeType,
      )
    : droppableContainers;

  // Overlap-threshold pass: find the candidate that the ghost overlaps the most
  // while still exceeding the minimum threshold.
  let bestId: string | null = null;
  let bestOverlap = 0;

  for (const container of candidates) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;

    // Vertical intersection only — we're sorting a vertical list.
    const overlapHeight =
      Math.min(collisionRect.bottom, rect.bottom) - Math.max(collisionRect.top, rect.top);

    if (overlapHeight <= 0) continue;

    const threshold = rect.height * OVERLAP_RATIO;
    if (overlapHeight >= threshold && overlapHeight > bestOverlap) {
      bestOverlap = overlapHeight;
      bestId = String(container.id);
    }
  }

  if (bestId !== null) {
    return [{ id: bestId }];
  }

  // Fallback: closestCenter when the ghost hasn't overlapped any candidate
  // enough — handles fast drags and positions near group edges.
  return closestCenter({ ...args, droppableContainers: candidates });
};
