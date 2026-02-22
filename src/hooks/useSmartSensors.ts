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
//   - Keeps the active item's own droppable in the candidate set to preserve the
//     "gap" target (over.id === active.id) when hovering near the source slot.
//   - Uses overlap-threshold detection as the primary algorithm: a swap fires
//     when the ghost rect overlaps a sibling row by >= 25% of that row's height.
//     Active-id overlap is evaluated separately so it does not block that first
//     sibling swap (which otherwise effectively behaves like a ~50% crossover).
//   - Keeps "gap stickiness": if no sibling meets threshold but the ghost still
//     overlaps the active gap at all, return active.id (avoid closestCenter
//     jumping early at boundaries).
//   - Falls back to closestCenter only when the ghost no longer overlaps any
//     active-gap rect (e.g. fast drags near group edges).

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
 *   We still keep the active id in the candidate set so "stay in the gap" can
 *   be returned when no sibling overlap crosses threshold. But active overlap is
 *   scored separately from sibling overlap so it doesn't delay the first swap.
 *
 * Type-filtered candidates:
 *   Only same-type droppables are considered (task vs. subitem vs. group),
 *   preventing cross-type collisions.
 *
 * closestCenter fallback:
 *   Used only when neither sibling-threshold overlap nor active-gap overlap
 *   applies (ghost near scroll edge or between groups).
 */

// Fraction of a row's height the ghost must overlap before the row slides.
// 0.25 → 10 px for a 40 px row; tweak if the feel needs adjusting.
const OVERLAP_RATIO = 0.25;

export const sortableCollisionDetection: CollisionDetection = (args) => {
  const { active, collisionRect, droppableRects, droppableContainers } = args;
  const activeType = (active.data.current as { type?: string } | undefined)?.type;
  const activeId = String(active.id);

  // Filter: same type only. Active item's own droppable is intentionally kept
  // in the candidate list (see JSDoc above).
  const candidates = activeType
    ? droppableContainers.filter(
        (c) => (c.data.current as { type?: string } | undefined)?.type === activeType,
      )
    : droppableContainers;

  // Overlap-threshold pass:
  // 1) choose the best *sibling* overlap above threshold;
  // 2) if none qualifies, allow staying over the active gap.
  let bestId: string | null = null;
  let bestOverlap = 0;
  let activeOverlap = 0;

  for (const container of candidates) {
    const rect = droppableRects.get(container.id);
    if (!rect) continue;
    const id = String(container.id);

    // Vertical intersection only — we're sorting a vertical list.
    const overlapHeight =
      Math.min(collisionRect.bottom, rect.bottom) - Math.max(collisionRect.top, rect.top);

    if (overlapHeight <= 0) continue;

    const threshold = rect.height * OVERLAP_RATIO;
    if (id === activeId) {
      activeOverlap = overlapHeight;
      continue;
    }

    if (overlapHeight >= threshold && overlapHeight > bestOverlap) {
      bestOverlap = overlapHeight;
      bestId = id;
    }
  }

  if (bestId !== null) {
    return [{ id: bestId }];
  }

  if (activeOverlap > 0) {
    return [{ id: activeId }];
  }

  // Fallback: closestCenter when the ghost hasn't overlapped any candidate
  // enough — handles fast drags and positions near group edges.
  return closestCenter({ ...args, droppableContainers: candidates });
};
