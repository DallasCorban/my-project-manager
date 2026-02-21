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
//   - Excludes the dragged item's own droppable (self-collision prevention) so
//     that pointerWithin never returns the active item as its own target when
//     the pointer is still within the original placeholder rect (upward drags).
//   - Uses pointerWithin as the primary algorithm: the swap fires as soon as
//     the pointer enters an adjacent row, eliminating the ~20px overshoot that
//     closestCenter requires for single-row moves.
//   - Falls back to closestCenter when the pointer is outside all same-type
//     droppables (e.g. at the very edge of the scroll container).

import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
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
 * Three improvements over plain closestCenter:
 *
 * 1. Type-filtered candidates — only droppables of the same type as the
 *    active item (task / subitem / group) are considered. This prevents a
 *    task drag from accidentally resolving against a group droppable (which
 *    spans the full group height) or a subitem droppable.
 *
 * 2. Self-exclusion — the dragged item's own droppable (the placeholder that
 *    stays at the original position) is excluded. Without this, pointerWithin
 *    can return the active item itself as the collision target when dragging
 *    upward (pointer is still within the original placeholder rect), which
 *    causes zero sort change and no shuffle animation for upward drags.
 *
 * 3. pointerWithin primary strategy — the swap fires as soon as the pointer
 *    physically enters an adjacent row, so a one-row drag only needs the
 *    pointer to cross the row boundary (0 px overshoot) instead of the
 *    ~20 px overshoot required by closestCenter. This is the main fix for
 *    "hard to move just one row" for tasks that have hidden subitems.
 */
export const sortableCollisionDetection: CollisionDetection = (args) => {
  const activeType = (args.active.data.current as { type?: string } | undefined)?.type;

  // Filter candidates to only the same type as the dragged item,
  // and exclude the dragged item's own droppable (self-collision prevention).
  const sameType = activeType
    ? args.droppableContainers.filter(
        (c) =>
          (c.data.current as { type?: string } | undefined)?.type === activeType &&
          c.id !== args.active.id,
      )
    : args.droppableContainers.filter((c) => c.id !== args.active.id);

  // Primary: pointer-within — zero overshoot for single-row moves.
  const within = pointerWithin({ ...args, droppableContainers: sameType });
  if (within.length > 0) return within;

  // Fallback: closest-center when the pointer leaves all same-type droppables
  // (e.g. dragging near the edge of the scroll area or between groups).
  return closestCenter({ ...args, droppableContainers: sameType });
};
