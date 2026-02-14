// useGanttDrag — handles Gantt bar drag interactions (move, resize, create).
// Ported from App.jsx:4274-4365 (mouse handlers).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragState } from '../types/timeline';
import { addDaysToKey, getTodayKey } from '../utils/date';
import { calculateCalendarDuration } from '../utils/timeline';
import type { TimelineDay } from '../types/timeline';

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

  const todayKey = useRef(getTodayKey());

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

      let originalStart = 0;
      let originalDuration = existingDuration || 1;

      if (type === 'create') {
        // Click on empty bar area — compute start from click position
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const visualIndex = Math.floor(offsetX / zoomLevel);
        const dayIndex = visualIndexToDayIndex[visualIndex] ?? 0;
        originalStart = dayIndex;
        originalDuration = 1;
      } else if (existingStartKey) {
        originalStart = getRelativeIndex(existingStartKey);
      }

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
    [zoomLevel, visualIndexToDayIndex, getRelativeIndex],
  );

  // Global mousemove + mouseup listeners when dragging
  useEffect(() => {
    if (!dragRef.current.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ds = dragRef.current;
      if (!ds.isDragging || !ds.type || !ds.projectId || !ds.taskId) return;

      const deltaVisualSlots = Math.round((e.clientX - ds.startX) / zoomLevel);
      if (deltaVisualSlots === ds.currentVisualSlot && ds.hasMoved) return;

      const origVisStart = dayToVisualIndex[ds.originalStart] ?? 0;

      if (ds.type === 'create') {
        // Expand the creation span
        const newSpan = Math.max(1, 1 + deltaVisualSlots);
        setDragState((prev) => ({
          ...prev,
          currentSpan: newSpan,
          currentVisualSlot: deltaVisualSlots,
          hasMoved: deltaVisualSlots !== 0,
        }));
        return;
      }

      const origVisEnd = origVisStart + (dayToVisualIndex[ds.originalStart + ds.originalDuration] !== undefined
        ? (dayToVisualIndex[ds.originalStart + ds.originalDuration] ?? origVisStart + ds.originalDuration) - origVisStart
        : ds.originalDuration);

      let newStartKey: string | null = null;
      let newDuration: number = ds.originalDuration;
      let isDelete = false;

      if (ds.type === 'move') {
        const newVisStart = Math.max(0, origVisStart + deltaVisualSlots);
        const newDayIndex = visualIndexToDayIndex[newVisStart] ?? ds.originalStart;
        newStartKey = addDaysToKey(todayKey.current, newDayIndex);
        // Keep original duration — recalculate to account for weekends
        newDuration = calculateCalendarDuration(newDayIndex, origVisEnd - origVisStart, rawDays, showWeekends);
      } else if (ds.type === 'resize-right') {
        const newVisEnd = Math.max(origVisStart + 1, origVisEnd + deltaVisualSlots);
        newStartKey = addDaysToKey(todayKey.current, ds.originalStart);
        newDuration = calculateCalendarDuration(ds.originalStart, newVisEnd - origVisStart, rawDays, showWeekends);
        if (newVisEnd <= origVisStart) isDelete = true;
      } else if (ds.type === 'resize-left') {
        const newVisStart = Math.min(origVisEnd - 1, origVisStart + deltaVisualSlots);
        const clampedVisStart = Math.max(0, newVisStart);
        const newDayIndex = visualIndexToDayIndex[clampedVisStart] ?? ds.originalStart;
        newStartKey = addDaysToKey(todayKey.current, newDayIndex);
        newDuration = calculateCalendarDuration(newDayIndex, origVisEnd - clampedVisStart, rawDays, showWeekends);
        if (clampedVisStart >= origVisEnd) isDelete = true;
      }

      // Apply the update in real-time
      if (!isDelete && newStartKey) {
        onUpdateDate(ds.projectId, ds.taskId, ds.subitemId, newStartKey, newDuration);
      }

      setDragState((prev) => ({
        ...prev,
        currentVisualSlot: deltaVisualSlots,
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

      if (ds.isDeleteMode) {
        // Collapse to zero = delete dates
        onUpdateDate(ds.projectId, ds.taskId, ds.subitemId, null, null);
      } else if (ds.type === 'create') {
        // Compute final start and duration from visual span
        const origVisStart = dayToVisualIndex[ds.originalStart] ?? 0;
        const startDayIndex = visualIndexToDayIndex[origVisStart] ?? ds.originalStart;
        const startKey = addDaysToKey(todayKey.current, startDayIndex);
        const duration = calculateCalendarDuration(startDayIndex, ds.currentSpan, rawDays, showWeekends);
        onUpdateDate(ds.projectId, ds.taskId, ds.subitemId, startKey, duration);
      }
      // For move/resize, updates were applied in real-time during mousemove

      setDragState(INITIAL_DRAG);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    dragState.isDragging,
    zoomLevel,
    showWeekends,
    rawDays,
    dayToVisualIndex,
    visualIndexToDayIndex,
    onUpdateDate,
  ]);

  return {
    dragState,
    handleMouseDown,
  };
}
