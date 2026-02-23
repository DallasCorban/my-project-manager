// GanttSubitemStack — renders ALL bars (parent + subitems) for a collapsed
// parent row as interactive stacked GanttBar components.
//
// Unified overlap model:
// - Parent task bar and subitem bars participate in one combined lane layout.
// - Lane assignment packs bars into horizontal lanes by start/end overlap.
// - Per-bar local overlap nudge: each bar computes a vertical offset (offsetY)
//   from the row center. Bar height is NEVER affected by overlap count.
//
// Z-order model (decoupled from lane index):
// - Overlap clusters (connected components by interval overlap) are identified.
// - Within each cluster, bars are sorted by interaction priority:
//   1. Actively dragged bar → highest z
//   2. Hovered bar → next highest
//   3. Later-starting bars above earlier-starting bars
//   4. Shorter bars above longer bars (on start tie)
//   5. Stable id sort as final tie-breaker
// - Z-indices are assigned sequentially per cluster with small gaps between.

import { useCallback, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { GanttBar } from './GanttBar';
import { normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { DragState } from '../../types/timeline';
import type { SettledOverride } from '../../hooks/useGanttDrag';

/** Vertical step between lanes in px. */
const LANE_STEP_PX = 6;

/** Max visible lanes before overflow indicator. */
const MAX_VISIBLE_LANES = 5;

/** Base z-index for stack bars (above grid, create preview, etc.) */
const BASE_Z = 40;

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
  settledOverrides: Record<string, SettledOverride>;
  clearSettledOverride: (key: string) => void;
  canEdit: boolean;
  onMouseDown: (
    e: React.PointerEvent,
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

/**
 * Compute interaction-aware z-order for collapsed bars.
 * Returns a map of bar id → z-index.
 *
 * Z-order rules (lowest → highest):
 * 1. Earlier-starting bars behind later-starting bars
 * 2. Longer bars behind shorter bars (on start tie)
 * 3. Parent behind subitems (on exact tie)
 * 4. Hovered bar promoted to front of its cluster
 * 5. Actively dragged bar promoted to absolute front
 */
function computeStackOrder(
  bars: LaneBar[],
  activeId: string | null,
  hoverId: string | null,
): Record<string, number> {
  if (bars.length === 0) return {};

  // 1) Sort by start for sweep-line cluster build
  const sorted = [...bars].sort((a, b) => {
    if (a.startVisual !== b.startVisual) return a.startVisual - b.startVisual;
    if (a.endVisual !== b.endVisual) return a.endVisual - b.endVisual;
    return a.id.localeCompare(b.id);
  });

  // 2) Build overlap clusters (connected components by interval overlap)
  type ClusteredBar = LaneBar & { clusterId: number; barDuration: number };
  const clustered: ClusteredBar[] = [];
  let clusterId = -1;
  let currentMaxEnd = -Infinity;

  for (const b of sorted) {
    if (b.startVisual >= currentMaxEnd) {
      clusterId += 1;
      currentMaxEnd = b.endVisual;
    } else {
      currentMaxEnd = Math.max(currentMaxEnd, b.endVisual);
    }
    clustered.push({
      ...b,
      clusterId,
      barDuration: Math.max(1, b.endVisual - b.startVisual),
    });
  }

  // 3) Group by cluster
  const byCluster = new Map<number, ClusteredBar[]>();
  for (const b of clustered) {
    const list = byCluster.get(b.clusterId);
    if (list) list.push(b);
    else byCluster.set(b.clusterId, [b]);
  }

  // 4) Assign z per cluster with deterministic ordering
  const zById: Record<string, number> = {};
  let cursor = BASE_Z;
  const clusterIds = Array.from(byCluster.keys()).sort((a, b) => a - b);

  for (const cid of clusterIds) {
    const clusterBars = byCluster.get(cid)!;

    // Sort back-to-front: lowest z first, highest z last
    clusterBars.sort((a, b) => {
      // Interaction priority: dragged/hovered bars go to front (higher z)
      const rank = (x: ClusteredBar): number => {
        if (activeId && x.id === activeId) return 3;
        if (hoverId && x.id === hoverId) return 2;
        return 1;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      // Later-starting bars in front
      if (a.startVisual !== b.startVisual) return a.startVisual - b.startVisual;

      // Shorter bars in front on ties
      if (a.barDuration !== b.barDuration) return b.barDuration - a.barDuration;

      // Parent slightly behind on exact ties
      if (a.isParent !== b.isParent) return a.isParent ? -1 : 1;

      // Stable deterministic fallback
      return a.id.localeCompare(b.id);
    });

    for (const b of clusterBars) {
      zById[b.id] = cursor++;
    }

    // Small gap between clusters for readability
    cursor += 2;
  }

  return zById;
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
  settledOverrides,
  clearSettledOverride: _clearSettledOverride,
  canEdit,
  onMouseDown,
}: GanttSubitemStackProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);

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

  // Determine actively dragged bar id
  const activeBarId = useMemo(() => {
    if (!dragState.isDragging || dragState.type === 'create' || !dragState.hasMoved) return null;
    // Check if the drag is for a bar in this stack
    if (dragState.subitemId) return dragState.subitemId;
    if (dragState.taskId === parentTaskId && dragState.subitemId === null) return parentTaskId;
    return null;
  }, [dragState, parentTaskId]);

  // Compute z-order from overlap clusters + interaction state.
  // Recomputes when lanes, hover, or drag state change.
  const zById = useMemo(
    () => computeStackOrder(lanes, activeBarId, hoveredBarId),
    [lanes, activeBarId, hoveredBarId],
  );

  // Stable callback factory for hover changes per bar
  const handleHoverChange = useCallback(
    (barId: string, hovered: boolean) => {
      setHoveredBarId((prev) => {
        if (hovered) return barId;
        // Only clear if this bar is the one currently hovered
        return prev === barId ? null : prev;
      });
    },
    [],
  );

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

          // Settled override key — matches useGanttDrag format
          const settledKey = bar.isParent
            ? parentTaskId
            : `${parentTaskId}:${bar.id}`;
          const settled = settledOverrides[settledKey];

          let left = isThisDragging
            ? dragState.visualLeft
            : bar.startVisual * zoomLevel;
          let width = isThisDragging
            ? dragState.visualWidth
            : Math.max(bar.widthVisual * zoomLevel, zoomLevel * 0.5);

          // Apply settled override — auto-clears via timeout in useGanttDrag
          if (settled && !isThisDragging) {
            left = settled.visualLeft;
            width = settled.visualWidth;
          }

          return (
            <div
              key={bar.id}
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: zById[bar.id] ?? BASE_Z,
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
                onHoverChange={(hovered) => handleHoverChange(bar.id, hovered)}
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
              {/* Bin icon for resize-to-delete */}
              {isThisDragging && dragState.isDeleteMode && dragState.deleteBinVisualSlot !== null && (
                <div
                  className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none"
                  style={{
                    left: dragState.deleteBinVisualSlot * zoomLevel,
                    width: Math.max(zoomLevel, rowHeight),
                    animation: 'deletePulse 1.2s ease-in-out infinite',
                  }}
                >
                  <Trash2 size={Math.round(rowHeight * 0.45)} className="text-red-500" />
                </div>
              )}
            </div>
          );
        })}

      {/* Overflow indicator */}
      {overflowCount > 0 && (
        <div
          className={`absolute right-2 bottom-0.5 text-[10px] font-medium ${
            darkMode ? 'text-gray-500' : 'text-gray-400'
          }`}
          style={{ zIndex: BASE_Z + lanes.length + 10 }}
        >
          +{overflowCount} more
        </div>
      )}
    </div>
  );
}
