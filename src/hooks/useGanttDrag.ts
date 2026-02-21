// useGanttDrag — handles Gantt bar drag interactions (move, resize, create).
//
// KEY DESIGN:  The bar's visual position during drag is computed purely from
// the drag-start snapshot + mouse delta.  This avoids the feedback loop:
//   mousemove → store update → re-render → recalculate position from store
// which causes jitter when the visual↔calendar conversions aren't perfectly
// invertible (especially with hidden weekends).
//
// The drag state includes `visualLeft` and `visualWidth` (in pixels) which
// GanttTaskRow uses directly instead of computing from the store.

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
  visualLeft: 0,
  visualWidth: 0,
};

interface UseGanttDragOptions {
  zoomLevel: number;
  showWeekends: boolean;
  rawDays: TimelineDay[];
  dayToVisualIndex: Record<number, number>;
  visualIndexToDayIndex: Record<number, number>;
  getRelativeIndex: (dateKey: string | null | undefined) => number | null;
  onUpdateDate: (
    pid: string,
    tid: string,
    sid: string | null,
    start: string | null,
    duration: number | null,
  ) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Walk forward from a raw day index by `visualSlots` visible slots and return
 * the raw day index we land on.
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

/** Overrides that persist after a drag ends until the store catches up. */
export interface SettledOverride {
  visualLeft: number;
  visualWidth: number;
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

  // Settled overrides — keyed by "taskId" or "taskId:subitemId".
  // Populated on mouseup with the bar's final visual position so rendering
  // continues to use the drag-derived position until the store agrees.
  const [settledOverrides, setSettledOverrides] = useState<Record<string, SettledOverride>>({});

  // Mutable refs — the mousemove handler reads from these so the effect
  // dependency list stays stable (only `dragState.isDragging`).
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

  // Snapshot captured at mousedown — never changes during a single drag gesture.
  const snapRef = useRef({
    origVisStart: 0,   // visual slot index of bar start
    origVisWidth: 0,   // visual slot count of bar width
    frozenZoom: 0,     // px/slot at drag start
    frozenD2V: {} as Record<number, number>,
    frozenV2D: {} as Record<number, number>,
  });

  /**
   * Start a drag operation on a Gantt bar or empty area.
   */
  const handlePointerDown = useCallback(
    (
      e: React.PointerEvent,
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

      let originalStart = 0;                           // raw day index
      let originalDuration = existingDuration || 1;    // calendar days

      if (type === 'create') {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const visualIndex = Math.floor(offsetX / zoom);
        const rawIdx = v2d[visualIndex];
        if (rawIdx === undefined) return; // clicked outside mapped range
        originalStart = rawIdx;
        originalDuration = 1;
      } else if (existingStartKey) {
        const rel = getRelativeIndex(existingStartKey);
        if (rel === null) return; // unmappable date — skip drag
        originalStart = rel;
      }

      // Compute the visual-slot positions from the *current* mapping and
      // freeze them so the entire drag gesture uses a single consistent mapping.
      const origVisStart = d2v[originalStart];
      if (origVisStart === undefined) return; // start day not in visible range
      const endRaw = originalStart + originalDuration;
      let origVisEnd = d2v[endRaw];
      if (origVisEnd === undefined) {
        // End falls on a hidden weekend — probe forward
        for (let probe = endRaw + 1; probe <= endRaw + 3; probe++) {
          if (d2v[probe] !== undefined) { origVisEnd = d2v[probe]; break; }
        }
        if (origVisEnd === undefined) origVisEnd = origVisStart + originalDuration;
      }
      const origVisWidth = Math.max(1, origVisEnd - origVisStart);

      // Freeze the mapping tables so they can't shift mid-drag
      snapRef.current = {
        origVisStart,
        origVisWidth,
        frozenZoom: zoom,
        frozenD2V: { ...d2v },
        frozenV2D: { ...v2d },
      };

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
        visualLeft: origVisStart * zoom,
        visualWidth: origVisWidth * zoom,
      });
    },
    [getRelativeIndex],
  );

  // ── Pointermove / pointerup (registered once per drag) ──────────────
  useEffect(() => {
    if (!dragRef.current.isDragging) return;

    const handleMouseMove = (e: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds.isDragging || !ds.type || !ds.projectId || !ds.taskId) return;

      const snap = snapRef.current;
      const zoom = snap.frozenZoom;           // use frozen zoom
      const d2v = snap.frozenD2V;             // use frozen mapping
      const v2d = snap.frozenV2D;

      const deltaVisual = Math.round((e.clientX - ds.startX) / zoom);
      if (deltaVisual === ds.currentVisualSlot && ds.hasMoved) return;

      const { origVisStart, origVisWidth } = snap;

      // ── Create ────────────────────────────────────────────────────
      if (ds.type === 'create') {
        const newSpan = Math.max(1, 1 + deltaVisual);
        setDragState((prev) => ({
          ...prev,
          currentSpan: newSpan,
          currentVisualSlot: deltaVisual,
          hasMoved: deltaVisual !== 0,
          visualLeft: origVisStart * zoom,
          visualWidth: newSpan * zoom,
        }));
        return;
      }

      let newVisStart: number = origVisStart;
      let newVisWidth: number = origVisWidth;
      let isDelete = false;

      // ── Move ──────────────────────────────────────────────────────
      if (ds.type === 'move') {
        newVisStart = Math.max(0, origVisStart + deltaVisual);
        // Visual width is unchanged — the bar slides without changing size
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
        newVisStart = origVisStart;
      }

      // ── Resize left ──────────────────────────────────────────────
      if (ds.type === 'resize-left') {
        const origVisEnd = origVisStart + origVisWidth;
        newVisStart = Math.max(0, Math.min(origVisEnd - 1, origVisStart + deltaVisual));
        newVisWidth = origVisEnd - newVisStart;
        if (newVisWidth < 1) {
          isDelete = true;
          newVisWidth = 1;
        }
      }

      // ── Convert visual → calendar for the store (background persistence) ──
      const newStartRaw = v2d[newVisStart] ?? ds.originalStart;
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
        visualLeft: newVisStart * zoom,
        visualWidth: Math.max(newVisWidth * zoom, zoom),
      }));
    };

    const handleMouseUp = (_e: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds.isDragging || !ds.type || !ds.projectId || !ds.taskId) {
        setDragState(INITIAL_DRAG);
        return;
      }

      const snap = snapRef.current;
      const d2v = snap.frozenD2V;
      const v2d = snap.frozenV2D;

      if (ds.isDeleteMode) {
        updateRef.current(ds.projectId, ds.taskId, ds.subitemId, null, null);
      } else if (ds.type === 'create') {
        const origVisStart = d2v[ds.originalStart] ?? 0;
        const startDayIndex = v2d[origVisStart] ?? ds.originalStart;
        const startKey = addDaysToKey(todayKey.current, startDayIndex);
        const duration = visualWidthToCalendarDuration(startDayIndex, ds.currentSpan, v2d, d2v);
        updateRef.current(ds.projectId, ds.taskId, ds.subitemId, startKey, duration);
      }
      // For move / resize the store was already updated continuously.

      // Settled override — keep the final visual position so the bar doesn't
      // snap to a stale store value between mouseup and Firestore echo settling.
      // Held for 1s (well beyond 250ms debounce + network RTT), then auto-cleared.
      if (ds.hasMoved && !ds.isDeleteMode) {
        const key = ds.subitemId ? `${ds.taskId}:${ds.subitemId}` : ds.taskId!;
        setSettledOverrides((prev) => ({
          ...prev,
          [key]: { visualLeft: ds.visualLeft, visualWidth: ds.visualWidth },
        }));
        setTimeout(() => {
          setSettledOverrides((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }, 1000);
      }

      setDragState(INITIAL_DRAG);
    };

    window.addEventListener('pointermove', handleMouseMove);
    window.addEventListener('pointerup', handleMouseUp);

    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
    };
    // Only re-register when a drag starts/stops — everything else is in refs/snap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState.isDragging]);

  // Clear a settled override once the store-computed position matches.
  const clearSettledOverride = useCallback((key: string) => {
    setSettledOverrides((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return {
    dragState,
    handlePointerDown,
    settledOverrides,
    clearSettledOverride,
  };
}
