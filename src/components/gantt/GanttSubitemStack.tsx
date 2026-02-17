// GanttSubitemStack — renders collapsed subitem bars as interactive stacked
// GanttBar components within a parent row. Uses the same bar component as
// tasks for full visual and interaction parity (drag/resize/delete).
//
// Stacking approach:
// - Bars that don't overlap anything sit centered (marginTop: 0).
// - Bars that overlap others are nudged up/down based on their local overlap
//   group size, NOT a global lane count. This prevents non-overlapping bars
//   from shifting when unrelated bars happen to overlap elsewhere.
// - Wrappers use pointer-events-none so that only the visible bar area
//   captures mouse events, keeping bars behind others still draggable.

import { useMemo } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { GanttBar } from './GanttBar';
import { normalizeDateKey } from '../../utils/date';
import type { Subitem } from '../../types/item';
import type { DragState } from '../../types/timeline';

interface SubitemLane {
  subitem: Subitem;
  laneIndex: number;
  startVisual: number;
  endVisual: number;
  widthVisual: number;
  /** How many lanes are occupied in this bar's overlap group */
  localLaneCount: number;
}

const MAX_VISIBLE_LANES = 5;

interface GanttSubitemStackProps {
  subitems: Subitem[];
  parentTaskId: string;
  projectId: string;
  zoomLevel: number;
  rowHeight: number;
  showLabels: boolean;
  getRelativeIndex: (dateKey: string | null | undefined) => number;
  dayToVisualIndex: Record<number, number>;
  getColor: (item: Subitem) => string;
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

export function GanttSubitemStack({
  subitems,
  parentTaskId,
  projectId,
  zoomLevel,
  rowHeight: _rowHeight,
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
    // Filter subitems that have dates
    const dated = subitems
      .filter((s) => s.start)
      .map((s) => {
        const relIdx = getRelativeIndex(s.start as string);
        const dur = Math.max(1, Number(s.duration || 1));
        const startVis = dayToVisualIndex[relIdx] ?? 0;
        // Find end visual index — probe forward if end falls on a hidden weekend
        const rawEnd = relIdx + dur;
        let endVis: number | undefined = dayToVisualIndex[rawEnd];
        if (endVis === undefined) {
          for (let probe = rawEnd + 1; probe <= rawEnd + 3; probe++) {
            if (dayToVisualIndex[probe] !== undefined) {
              endVis = dayToVisualIndex[probe];
              break;
            }
          }
          if (endVis === undefined) endVis = startVis + dur;
        }
        return { subitem: s, start: startVis, end: endVis };
      })
      .sort((a, b) => a.start - b.start);

    // Lane assignment algorithm — pack subitems into horizontal lanes
    const laneEnds: number[] = [];
    const assigned: Array<{
      subitem: Subitem;
      laneIndex: number;
      startVisual: number;
      endVisual: number;
      widthVisual: number;
    }> = [];

    for (const item of dated) {
      let assignedLane = -1;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] <= item.start) {
          assignedLane = l;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[assignedLane] = item.end;

      assigned.push({
        subitem: item.subitem,
        laneIndex: assignedLane,
        startVisual: item.start,
        endVisual: item.end,
        widthVisual: item.end - item.start,
      });
    }

    // Compute local lane count per bar: how many distinct lanes overlap
    // this bar's time range. This is used instead of global maxLanes so
    // non-overlapping bars stay centered and unaffected.
    const result: SubitemLane[] = assigned.map((bar) => {
      // Find the set of lane indices occupied by bars overlapping this bar
      const overlappingLanes = new Set<number>();
      for (const other of assigned) {
        // Two bars overlap if their ranges intersect
        if (other.startVisual < bar.endVisual && other.endVisual > bar.startVisual) {
          overlappingLanes.add(other.laneIndex);
        }
      }
      return {
        ...bar,
        localLaneCount: Math.min(overlappingLanes.size, MAX_VISIBLE_LANES),
      };
    });

    return result;
  }, [subitems, getRelativeIndex, dayToVisualIndex]);

  if (lanes.length === 0) return null;

  // Count overflow (subitems in hidden lanes)
  const overflowCount = lanes.filter((l) => l.laneIndex >= MAX_VISIBLE_LANES).length;

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none">
      {lanes
        .filter((item) => item.laneIndex < MAX_VISIBLE_LANES)
        .map((item) => {
          const subDuration = Math.max(1, Number(item.subitem.duration || 1));
          const normalizedStart = normalizeDateKey(item.subitem.start);

          // Check if this specific subitem is being dragged
          const isThisDragging =
            dragState.isDragging &&
            dragState.type !== 'create' &&
            dragState.hasMoved &&
            dragState.subitemId === item.subitem.id;

          const left = isThisDragging
            ? dragState.visualLeft
            : item.startVisual * zoomLevel;
          const width = isThisDragging
            ? dragState.visualWidth
            : Math.max(item.widthVisual * zoomLevel, zoomLevel * 0.5);

          // Per-bar offset using LOCAL lane count (not global maxLanes).
          // Only overlapping bars get nudged; isolated bars stay centered.
          //   localLaneCount=1 → marginTop = 0 (centered)
          //   localLaneCount=2 → lane0: -3px, lane1: +3px
          //   localLaneCount=3 → lane0: -6px, lane1: 0px, lane2: +6px
          const marginTop = (item.laneIndex * 6) - ((item.localLaneCount - 1) * 3);

          return (
            <div
              key={item.subitem.id}
              className="absolute inset-0 pointer-events-none"
              style={{
                marginTop,
                zIndex: 20 + item.laneIndex,
              }}
            >
              <GanttBar
                left={left}
                width={width}
                color={getColor(item.subitem)}
                label={item.subitem.name}
                showLabel={showLabels}
                zoomLevel={zoomLevel}
                dragState={dragState}
                taskId={parentTaskId}
                subitemId={item.subitem.id}
                onMouseDown={(e, type) => {
                  if (!canEdit) return;
                  onMouseDown(
                    e,
                    parentTaskId,
                    projectId,
                    type,
                    item.subitem.id,
                    'parent',
                    normalizedStart,
                    subDuration,
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
