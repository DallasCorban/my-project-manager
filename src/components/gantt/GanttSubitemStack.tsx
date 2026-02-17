// GanttSubitemStack — renders ALL bars (parent + subitems) for a collapsed
// parent row as interactive stacked GanttBar components.
//
// Unified overlap model:
// - Parent task bar and subitem bars participate in one combined lane layout.
// - Lane assignment packs bars into horizontal lanes by start/end overlap.
// - Per-bar local overlap nudge: each bar computes a vertical offset (offsetY)
//   from the row center. Bars that don't overlap anything stay centered
//   (offsetY = 0). Only overlapping groups get nudged up/down.
// - Bar height is NEVER affected by overlap count. Only offsetY and zIndex change.
// - Wrappers use pointer-events-none; GanttBar itself uses pointer-events-auto.

import { useMemo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { GanttBar } from './GanttBar';
import { normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { DragState } from '../../types/timeline';

/** Vertical step between lanes in px. */
const LANE_STEP_PX = 6;

/** Max visible lanes before overflow indicator. */
const MAX_VISIBLE_LANES = 5;

/** A bar in the unified lane layout — either the parent task or a subitem. */
interface LaneBar {
  id: string;
  name: string;
  color: string;
  laneIndex: number;
  startVisual: number;
  endVisual: number;
  widthVisual: number;
  normalizedStart: string | null;
  duration: number;
  isParent: boolean;
  subitemId: string | null;
  /** Vertical offset in px from row center. Only nudge, never height. */
  offsetY: number;
}

interface GanttSubitemStackProps {
  parentTask: Item;
  parentTaskId: string;
  projectId: string;
  zoomLevel: number;
  rowHeight: number;
  showLabels: boolean;
  getRelativeIndex: (dateKey: string | null | undefined) => number | null;
  dayToVisualIndex: Record<number, number>;
  getColor: (item: Item | Subitem) => string;
  dragState: DragState;
  canEdit: boolean;
  onMouseDown: (
    e: React.MouseEvent,
    taskId: string,
    projectId: string,
    type: DragState['type'],
    subitemId: string | null,
    origin: 'parent' | 'expanded',
    existingStartKey: string | null,
    existingDuration: number,
  ) => void;
}

/**
 * Resolve a date key to visual start/end positions.
 * Returns null if the date is unmappable (invalid key or outside visible range).
 */
function resolveVisualRange(
  dateKey: string | null,
  duration: number,
  getRelativeIndex: (dateKey: string | null | undefined) => number | null,
  dayToVisualIndex: Record<number, number>,
): { start: number; end: number } | null {
  if (!dateKey) return null;
  const relIdx = getRelativeIndex(dateKey);
  if (relIdx === null) return null;
  const startVis = dayToVisualIndex[relIdx];
  if (startVis === undefined) return null;

  const rawEnd = relIdx + duration;
  let endVis: number | undefined = dayToVisualIndex[rawEnd];
  if (endVis === undefined) {
    for (let probe = rawEnd + 1; probe <= rawEnd + 3; probe++) {
      if (dayToVisualIndex[probe] !== undefined) {
        endVis = dayToVisualIndex[probe];
        break;
      }
    }
    if (endVis === undefined) endVis = startVis + duration;
  }
  return { start: startVis, end: endVis };
}

export function GanttSubitemStack({
  parentTask,
  parentTaskId,
  projectId,
  zoomLevel,
  rowHeight,
  showLabels,
  getRelativeIndex,
  dayToVisualIndex,
  getColor,
  dragState,
  canEdit,
  onMouseDown,
}: GanttSubitemStackProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  const lanes = useMemo(() => {
    // Build a combined list of all renderable bars (parent + subitems)
    type RawBar = {
      id: string;
      name: string;
      color: string;
      normalizedStart: string | null;
      duration: number;
      isParent: boolean;
      subitemId: string | null;
      start: number;
      end: number;
    };

    const rawBars: RawBar[] = [];

    // Include parent task bar if it has valid dates
    const parentNorm = normalizeDateKey(parentTask.start);
    const parentDur = Math.max(1, Number(parentTask.duration || 1));
    const parentRange = resolveVisualRange(parentNorm, parentDur, getRelativeIndex, dayToVisualIndex);
    if (parentRange) {
      rawBars.push({
        id: parentTask.id,
        name: parentTask.name,
        color: getColor(parentTask),
        normalizedStart: parentNorm,
        duration: parentDur,
        isParent: true,
        subitemId: null,
        start: parentRange.start,
        end: parentRange.end,
      });
    }

    // Include subitem bars with valid dates
    for (const sub of parentTask.subitems) {
      if (!sub.start) continue;
      const subNorm = normalizeDateKey(sub.start);
      const subDur = Math.max(1, Number(sub.duration || 1));
      const subRange = resolveVisualRange(subNorm, subDur, getRelativeIndex, dayToVisualIndex);
      if (!subRange) continue;

      rawBars.push({
        id: sub.id,
        name: sub.name,
        color: getColor(sub),
        normalizedStart: subNorm,
        duration: subDur,
        isParent: false,
        subitemId: sub.id,
        start: subRange.start,
        end: subRange.end,
      });
    }

    if (rawBars.length === 0) return [];

    // Sort: by start, then end, then parent first for deterministic ties
    rawBars.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.end !== b.end) return a.end - b.end;
      if (a.isParent !== b.isParent) return a.isParent ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    // Lane assignment — pack ALL bars into horizontal lanes
    const laneEnds: number[] = [];
    const assigned: Array<RawBar & { laneIndex: number }> = [];

    for (const bar of rawBars) {
      let assignedLane = -1;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] <= bar.start) {
          assignedLane = l;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[assignedLane] = bar.end;

      assigned.push({ ...bar, laneIndex: assignedLane });
    }

    // Compute per-bar offsetY from local overlap cluster.
    // For each bar, find overlapping lane indices → sort → use bar's
    // position in that sorted list as localLaneIndex.
    // offsetY = (localLaneIndex - (localLaneCount - 1) / 2) * LANE_STEP_PX
    const result: LaneBar[] = assigned.map((bar) => {
      const overlapLaneSet = new Set<number>();
      for (const other of assigned) {
        if (other.start < bar.end && other.end > bar.start) {
          overlapLaneSet.add(other.laneIndex);
        }
      }
      const overlapLanes = Array.from(overlapLaneSet).sort((a, b) => a - b);
      const localLaneCount = Math.min(overlapLanes.length || 1, MAX_VISIBLE_LANES);
      const localLaneIndex = Math.max(0, overlapLanes.indexOf(bar.laneIndex));
      const offsetY = (localLaneIndex - (localLaneCount - 1) / 2) * LANE_STEP_PX;

      return {
        id: bar.id,
        name: bar.name,
        color: bar.color,
        laneIndex: bar.laneIndex,
        startVisual: bar.start,
        endVisual: bar.end,
        widthVisual: bar.end - bar.start,
        normalizedStart: bar.normalizedStart,
        duration: bar.duration,
        isParent: bar.isParent,
        subitemId: bar.subitemId,
        offsetY,
      };
    });

    return result;
  }, [parentTask, getRelativeIndex, dayToVisualIndex, getColor]);

  if (lanes.length === 0) return null;

  const overflowCount = lanes.filter((l) => l.laneIndex >= MAX_VISIBLE_LANES).length;

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none" style={{ overflow: 'visible' }}>
      {lanes
        .filter((bar) => bar.laneIndex < MAX_VISIBLE_LANES)
        .map((bar) => {
          // Check if this specific bar is being dragged
          const isThisDragging =
            dragState.isDragging &&
            dragState.type !== 'create' &&
            dragState.hasMoved &&
            (bar.isParent
              ? dragState.taskId === parentTaskId && dragState.subitemId === null
              : dragState.subitemId === bar.id);

          const left = isThisDragging
            ? dragState.visualLeft
            : bar.startVisual * zoomLevel;
          const width = isThisDragging
            ? dragState.visualWidth
            : Math.max(bar.widthVisual * zoomLevel, zoomLevel * 0.5);

          // GanttBar positions itself via top: calc(50% + offsetY) so we just
          // need a positioned container with the right z-index. No wrapper
          // sizing or marginTop needed — overlap only affects offsetY.
          return (
            <div
              key={bar.id}
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 20 + bar.laneIndex,
                overflow: 'visible',
              }}
            >
              <GanttBar
                left={left}
                width={width}
                color={bar.color}
                label={bar.name}
                showLabel={showLabels}
                zoomLevel={zoomLevel}
                rowHeight={rowHeight}
                verticalOffsetPx={bar.offsetY}
                dragState={dragState}
                taskId={parentTaskId}
                subitemId={bar.subitemId}
                onMouseDown={(e, type) => {
                  if (!canEdit) return;
                  onMouseDown(
                    e,
                    parentTaskId,
                    projectId,
                    type,
                    bar.subitemId,
                    'parent',
                    bar.normalizedStart,
                    bar.duration,
                  );
                }}
              />
            </div>
          );
        })}

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <div
          className={`absolute right-2 bottom-0.5 text-[10px] font-medium ${
            darkMode ? 'text-gray-500' : 'text-gray-400'
          }`}
          style={{ zIndex: 30 }}
        >
          +{overflowCount} more
        </div>
      )}
    </div>
  );
}
