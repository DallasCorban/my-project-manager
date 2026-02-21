// useSmartSensors — shared dnd-kit sensor configuration for Board and Gantt.
//
// SmartPointerSensor: extends PointerSensor but refuses to activate a drag
// when the initial pointer-down lands on an interactive element (inputs,
// buttons, contenteditable, or anything marked data-no-dnd). This prevents
// accidental drags when the user is clicking to edit a task name or pressing
// a button.
//
// useSortableSensors: convenience hook — returns the configured sensors array
// (SmartPointerSensor with 8px distance constraint + KeyboardSensor for a11y).

import { PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
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
