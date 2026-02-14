// useGanttDrag — handles Gantt bar drag interactions (move, resize, create).
// All drag math works in visual-slot space during the drag and only converts
// to calendar dates when committing updates.  Lookup tables and callbacks live
// in refs so the mousemove / mouseup listeners are registered exactly once per
// drag and never torn down mid-interaction.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragState, TimelineDay } from '../types/timeline';
import { addDaysToKey, getTodayKey } from '../utils/date';

const INITIAL_DRAG: DragState = {
  isDragging: false,
  type: null,
  taskId: null,
  subitemId: null,
  projectId: null,
  startX: 0,
  originalStart: 0,
  originalDuration: 0,
  currentSpan: 1,
  currentVisualSlot: 0,
  hasMoved: false,
  isDeleteMode: false,
  origin: null,
};

interface UseGanttDragOptions {
  zoomLevel: number;
  showWeekends: boolean;
  rawDays: TimelineDay[];
  dayToVisualIndex: Record<number, number>;
  visualIndexToDayIndex: Record<number, number>;
  getRelativeIndex: (dateKey: string | null | undefined) => number;
  onUpdateDate: (
    pid: string,
    tid: string,
    sid: string | null,
    start: string | null,
    duration: number | null,
  ) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Count visual slots between two raw day indices. */
function visualSpanBetween(
  fromRaw: number,
  toRaw: number,
  d2v: Record<number, number>,
): number {
  const vs = d2v[fromRaw];
  const ve = d2v[toRaw];
  if (vs === undefined || ve === undefined) return Math.abs(toRaw - fromRaw);
  return ve - vs;
}

/**
 * Walk forward from a raw day index by `visualSlots` visible slots and return
 * the raw day index we land on.  When weekends are hidden this correctly skips
 * them so one visual slot always equals one visible column.
 */
function rawIndexAfterVisualSlots(
  startRaw: number,
  visualSlots: number,
  v2d: Record<number, number>,
  d2v: Record<number, number>,
): number {
  const startVis = d2v[startRaw];
  if (startVis === undefined) return startRaw + visualSlots;
  const targetVis = startVis + visualSlots;
  const raw = v2d[targetVis];
  return raw ?? startRaw + visualSlots;
}

/**
 * Convert a raw-day-index start + a calendar duration into its visual width
 * (number of visible columns the bar spans).
 */
function calendarDurationToVisualWidth(
  startRaw: number,
  calDuration: number,
  d2v: Record<number, number>,
): number {
  const endRaw = startRaw + calDuration;
  return visualSpanBetween(startRaw, endRaw, d2v);
}

/**
 * Convert a visual width back to a calendar duration (including any hidden
 * weekend days).
 */
function visualWidthToCalendarDuration(
  startRaw: number,
  visWidth: number,
  v2d: Record<number, number>,
  d2v: Record<number, number>,
): number {
  const endRaw = rawIndexAfterVisualSlots(startRaw, visWidth, v2d, d2v);
  return Math.max(1, endRaw - startRaw);
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useGanttDrag({
  zoomLevel,
  showWeekends,
  rawDays,
  dayToVisualIndex,
  visualIndexToDayIndex,
  getRelativeIndex,
  onUpdateDate,
}: UseGanttDragOptions) {
  const [dragState, setDragState] = useState<DragState>(INITIAL_DRAG);
  const dragRef = useRef(dragState);
  dragRef.current = dragState;

  // Keep mutable refs for everything the mousemove handler needs so that the
  // effect dependency list is stable (only `dragState.isDragging`).
  const zoomRef = useRef(zoomLevel);
  zoomRef.current = zoomLevel;

  const d2vRef = useRef(dayToVisualIndex);
  d2vRef.current = dayToVisualIndex;

  const v2dRef = useRef(visualIndexToDayIndex);
  v2dRef.current = visualIndexToDayIndex;

  const updateRef = useRef(onUpdateDate);
  updateRef.current = onUpdateDate;

  const rawDaysRef = useRef(rawDays);
  rawDaysRef.current = rawDays;

  const weekendsRef = useRef(showWeekends);
  weekendsRef.current = showWeekends;

  const todayKey = useRef(getTodayKey());

  // Snapshot of visual-slot positions at drag start so they stay constant for
  // the entire drag even if re-renders happen.
  const snapRef = useRef({ origVisStart: 0, origVisWidth: 0 });

  /**
   * Start a drag operation on a Gantt bar or empty area.
   */
  const handleMouseDown = useCallback(
    (
      e: React.MouseEvent,
      taskId: string,
      projectId: string,
      type: DragState['type'],
      subitemId: string | null,
      origin: 'parent' | 'expanded',
      existingStartKey: string | null,
      existingDuration: number,
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const d2v = d2vRef.current;
      const v2d = v2dRef.current;
      const zoom = zoomRef.current;

      let originalStart = 0;          // raw day index
      let originalDuration = existingDuration || 1;  // calendar days

      if (type === 'create') {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const visualIndex = Math.floor(offsetX / zoom);
        originalStart = v2d[visualIndex] ?? 0;
        originalDuration = 1;
      } else if (existingStartKey) {
        originalStart = getRelativeIndex(existingStartKey);
      }

      // Snapshot visual positions at drag-start so they stay constant.
      const origVisStart = d2v[originalStart] ?? 0;
      const origVisWidth = calendarDurationToVisualWidth(originalStart, originalDuration, d2v);
      snapRef.current = { origVisStart, origVisWidth: Math.max(1, origVisWidth) };

      setDragState({
        isDragging: true,
        type,
        taskId,
        subitemId,
        projectId,
        startX: e.clientX,
        originalStart,
        originalDuration,
        currentSpan: 1,
        currentVisualSlot: 0,
        hasMoved: false,
        isDeleteMode: false,
        origin,
      });
    },
    [getRelativeIndex],
  );

  // ── Mousemove / mouseup (registered once per drag) ───────────────────
  useEffect(() => {
    if (!dragRef.current.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragRef.current;
      if (!ds.isDragging || !ds.type || !ds.projectId || !ds.taskId) return;

      const zoom = zoomRef.current;
      const d2v = d2vRef.current;
      const v2d = v2dRef.current;

      const deltaVisual = Math.round((e.clientX - ds.startX) / zoom);
      if (deltaVisual === ds.currentVisualSlot && ds.hasMoved) return;

      const { origVisStart, origVisWidth } = snapRef.current;

      // ── Create ────────────────────────────────────────────────────
      if (ds.type === 'create') {
        const newSpan = Math.max(1, 1 + deltaVisual);
        setDragState((prev) => ({
          ...prev,
          currentSpan: newSpan,
          currentVisualSlot: deltaVisual,
          hasMoved: deltaVisual !== 0,
        }));
        return;
      }

      let newStartRaw: number = ds.originalStart;
      let newVisWidth: number = origVisWidth;
      let isDelete = false;

      // ── Move ──────────────────────────────────────────────────────
      if (ds.type === 'move') {
        const newVisStart = Math.max(0, origVisStart + deltaVisual);
        newStartRaw = v2d[newVisStart] ?? ds.originalStart;
        // The visual width stays the same — recalculate calendar duration
        // from the new start position to preserve visual size.
        newVisWidth = origVisWidth;
      }

      // ── Resize right ─────────────────────────────────────────────
      if (ds.type === 'resize-right') {
        const origVisEnd = origVisStart + origVisWidth;
        const newVisEnd = origVisEnd + deltaVisual;
        newVisWidth = newVisEnd - origVisStart;
        if (newVisWidth < 1) {
          isDelete = true;
          newVisWidth = 1;
        }
        newStartRaw = ds.originalStart;
      }

      // ── Resize left ──────────────────────────────────────────────
      if (ds.type === 'resize-left') {
        const origVisEnd = origVisStart + origVisWidth;
        const newVisStart = origVisStart + deltaVisual;
        const clampedVisStart = Math.max(0, Math.min(origVisEnd - 1, newVisStart));
        newStartRaw = v2d[clampedVisStart] ?? ds.originalStart;
        newVisWidth = origVisEnd - clampedVisStart;
        if (newVisWidth < 1) {
          isDelete = true;
          newVisWidth = 1;
        }
      }

      // Convert visual width → calendar duration
      const calDuration = visualWidthToCalendarDuration(newStartRaw, newVisWidth, v2d, d2v);
      const newStartKey = addDaysToKey(todayKey.current, newStartRaw);

      if (!isDelete && newStartKey) {
        updateRef.current(ds.projectId, ds.taskId, ds.subitemId, newStartKey, calDuration);
      }

      setDragState((prev) => ({
        ...prev,
        currentVisualSlot: deltaVisual,
        hasMoved: true,
        isDeleteMode: isDelete,
      }));
    };

    const handleMouseUp = () => {
      const ds = dragRef.current;
      if (!ds.isDragging || !ds.type || !ds.projectId || !ds.taskId) {
        setDragState(INITIAL_DRAG);
        return;
      }

      const d2v = d2vRef.current;
      const v2d = v2dRef.current;

      if (ds.isDeleteMode) {
        updateRef.current(ds.projectId, ds.taskId, ds.subitemId, null, null);
      } else if (ds.type === 'create') {
        const origVisStart = d2v[ds.originalStart] ?? 0;
        const startDayIndex = v2d[origVisStart] ?? ds.originalStart;
        const startKey = addDaysToKey(todayKey.current, startDayIndex);
        const duration = visualWidthToCalendarDuration(startDayIndex, ds.currentSpan, v2d, d2v);
        updateRef.current(ds.projectId, ds.taskId, ds.subitemId, startKey, duration);
      }
      // For move / resize the updates were applied continuously.

      setDragState(INITIAL_DRAG);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // Only re-register when a drag starts/stops — everything else is in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState.isDragging]);

  return {
    dragState,
    handleMouseDown,
  };
}
