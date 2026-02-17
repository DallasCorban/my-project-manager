// GanttTaskRow — a single task row in the Gantt view.
// Left side: label column (name, status, etc.) with TaskRow.
// Right side: bar area with day grid + GanttBar + creation preview.
// Ported from GanttView.jsx lines 406-569 (parent) and 597-705 (subitem).

import { ChevronRight, Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { GanttBar } from './GanttBar';
import { GanttSubitemStack } from './GanttSubitemStack';
import { normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { TimelineDay, DragState, ReorderDrag } from '../../types/timeline';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';

interface GanttTaskRowProps {
  task: Item | Subitem;
  projectId: string;
  parentTaskId?: string;
  isSubitem?: boolean;
  isExpanded?: boolean;
  visibleDays: TimelineDay[];
  zoomLevel: number;
  rowHeight: number;
  showWeekends: boolean;
  showLabels: boolean;
  colorBy: 'status' | 'type';
  statuses: StatusLabel[];
  jobTypes: JobTypeLabel[];
  getRelativeIndex: (dateKey: string | null | undefined) => number;
  dayToVisualIndex: Record<number, number>;
  dragState: DragState;
  reorderDrag: ReorderDrag | null;
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
  // Row reorder handlers
  onRowDragStart?: (e: React.DragEvent, type: string, id: string, pid: string) => void;
  onRowDragOver?: (e: React.DragEvent) => void;
  onRowDrop?: (e: React.DragEvent, type: string, id: string, pid: string) => void;
  onRowDragEnd?: (e: React.DragEvent) => void;
  // Label column handlers
  onUpdateName: (value: string) => void;
  onStatusSelect: (statusId: string) => void;
  onTypeSelect: (typeId: string) => void;
  onOpenUpdates?: () => void;
  onAddSubitem?: (projectId: string, taskId: string) => void;
}

export function GanttTaskRow({
  task,
  projectId,
  parentTaskId,
  isSubitem = false,
  isExpanded: _isExpanded = false,
  visibleDays,
  zoomLevel,
  rowHeight,
  showWeekends,
  showLabels,
  colorBy,
  statuses,
  jobTypes,
  getRelativeIndex,
  dayToVisualIndex,
  dragState,
  reorderDrag,
  canEdit,
  onMouseDown,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
  onUpdateName: _onUpdateName,
  onStatusSelect: _onStatusSelect,
  onTypeSelect: _onTypeSelect,
  onOpenUpdates,
  onAddSubitem,
}: GanttTaskRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const toggleItemExpand = useUIStore((s) => s.toggleItemExpand);

  const getTaskColor = (t: Item | Subitem): string => {
    if (colorBy === 'status') {
      return statuses.find((s) => s.id === t.status)?.color || '#c4c4c4';
    }
    return jobTypes.find((jt) => jt.id === t.jobTypeId)?.color || '#c4c4c4';
  };

  // Bar positioning calculations
  const normalizedStart = normalizeDateKey(task.start);
  const hasDates = Boolean(normalizedStart);
  const taskDuration = Math.max(1, Number(task.duration || 1));

  // Check if THIS bar is currently being dragged (move/resize).
  // For parent tasks: dragState.taskId === task.id && subitemId === null
  // For subitems: dragState.subitemId === task.id (task here IS the subitem)
  const isThisBarDragging =
    dragState.isDragging &&
    dragState.type !== 'create' &&
    dragState.hasMoved &&
    (isSubitem
      ? dragState.subitemId === task.id
      : dragState.taskId === task.id && dragState.subitemId === null);

  let barLeft = 0;
  let barWidth = 0;

  if (isThisBarDragging) {
    // During drag: use the drag handler's pixel-perfect visual position
    // directly. This avoids the store→render round-trip that causes jitter.
    barLeft = dragState.visualLeft;
    barWidth = dragState.visualWidth;
  } else if (hasDates && normalizedStart) {
    const relIdx = getRelativeIndex(normalizedStart);
    const startVisual = dayToVisualIndex[relIdx] ?? 0;

    // Find end visual index — walk forward to find the closest mapped day
    // at or after the raw end index.  This handles the case where the end
    // day falls on a hidden weekend.
    const rawEnd = relIdx + taskDuration;
    let endVisual: number | undefined = dayToVisualIndex[rawEnd];
    if (endVisual === undefined) {
      for (let probe = rawEnd + 1; probe <= rawEnd + 3; probe++) {
        if (dayToVisualIndex[probe] !== undefined) {
          endVisual = dayToVisualIndex[probe];
          break;
        }
      }
      if (endVisual === undefined) endVisual = startVisual + taskDuration;
    }

    barLeft = startVisual * zoomLevel;
    barWidth = Math.max((endVisual - startVisual) * zoomLevel, zoomLevel);
  }

  // Check if this task is being created (drag create preview)
  const isCreating =
    dragState.isDragging &&
    dragState.type === 'create' &&
    dragState.taskId === task.id &&
    dragState.subitemId === (isSubitem ? task.id : null);

  let createPreviewLeft = 0;
  let createPreviewWidth = 0;
  if (isCreating) {
    const origVisStart = dayToVisualIndex[dragState.originalStart] ?? 0;
    createPreviewLeft = origVisStart * zoomLevel;
    createPreviewWidth = dragState.currentSpan * zoomLevel;
  }

  // Determine if row is a drag reorder target
  const isDropTarget =
    reorderDrag?.active && reorderDrag.dropTargetId === task.id;

  const isDragging =
    reorderDrag?.active && reorderDrag.dragId === task.id;

  const actualRowHeight = rowHeight; // Same height for tasks and subitems — visual parity

  const hasSubitems = !isSubitem && 'subitems' in task && (task as Item).subitems.length > 0;
  const isCollapsed = hasSubitems && !expandedItems.includes(task.id);

  return (
    <div
      className={`flex relative group ${
        isDragging ? 'opacity-50' : ''
      } ${
        darkMode
          ? 'border-b border-[#2b2c32] hover:bg-[#202336]'
          : 'border-b border-[#eceff8] hover:bg-[#f5f5f5]'
      }`}
      style={{ height: actualRowHeight }}
      onDragOver={onRowDragOver}
      onDrop={(e) => onRowDrop?.(e, isSubitem ? 'subitem' : 'task', task.id, projectId)}
      onDragEnd={onRowDragEnd}
    >
      {/* Left label column — sticky, draggable for row reorder */}
      <div
        className={`sticky left-0 z-[200] flex items-center shrink-0 border-r overflow-hidden ${
          darkMode
            ? 'bg-[#1c213e] border-[#2b2c32]'
            : 'bg-white border-[#eceff8]'
        } ${isSubitem ? 'pl-8' : 'pl-3'}`}
        style={{ width: 320, minWidth: 320 }}
        draggable={canEdit}
        onDragStart={(e) => onRowDragStart?.(e, isSubitem ? 'subitem' : 'task', task.id, projectId)}
        onClick={(e) => {
          e.stopPropagation();
          onOpenUpdates?.();
        }}
      >
        <div className="flex items-center gap-2 w-full min-w-0">
          {/* Expand/collapse chevron (parent tasks only) */}
          {!isSubitem && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (hasSubitems) toggleItemExpand(task.id);
              }}
              className={`shrink-0 mr-0.5 transition-transform duration-150 ${
                hasSubitems
                  ? 'cursor-pointer text-gray-400 hover:text-blue-500'
                  : 'cursor-default text-gray-300 opacity-30'
              } ${expandedItems.includes(task.id) ? 'rotate-90' : ''}`}
            >
              <ChevronRight size={14} />
            </div>
          )}

          {/* Task name (truncated) */}
          <span
            className={`text-sm truncate flex-1 min-w-0 ${
              darkMode ? 'text-gray-200' : 'text-gray-700'
            } ${isSubitem ? 'text-xs' : ''}`}
          >
            {task.name}
          </span>

          {/* Status badge (small) */}
          <div
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: getTaskColor(task) }}
          />

          {/* Add subitem button (visible on hover for non-subitems) */}
          {!isSubitem && canEdit && onAddSubitem && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddSubitem(projectId, task.id);
              }}
              className={`shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                darkMode
                  ? 'hover:bg-white/10 text-gray-400'
                  : 'hover:bg-gray-200 text-gray-400'
              }`}
              title="Add subitem"
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Right bar area — scrollable with timeline */}
      <div
        className="relative flex-1 min-w-0"
        style={{ minWidth: visibleDays.length * zoomLevel }}
      >
        {/* Day grid background */}
        <div className="absolute inset-0 flex pointer-events-none">
          {visibleDays.map((day, i) => {
            const hasWeekendGap =
              !showWeekends && i > 0 && day.index > visibleDays[i - 1].index + 1;

            return (
              <div
                key={day.index}
                className={`h-full border-r ${
                  hasWeekendGap
                    ? darkMode
                      ? 'border-l-2 border-l-[#3e3f4b]'
                      : 'border-l-2 border-l-gray-300'
                    : ''
                } ${
                  day.isToday
                    ? 'bg-blue-500/10'
                    : day.isWeekend
                      ? 'bg-black/[0.07]'
                      : ''
                } ${darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'}`}
                style={{ width: zoomLevel, minWidth: zoomLevel }}
              />
            );
          })}
        </div>

        {/* Click area for creating new bars */}
        {canEdit && !hasDates && (
          <div
            className="absolute inset-0 cursor-crosshair z-10"
            onMouseDown={(e) =>
              onMouseDown(
                e,
                task.id,
                projectId,
                'create',
                isSubitem ? task.id : null,
                isSubitem ? 'expanded' : 'parent',
                null,
                1,
              )
            }
          />
        )}

        {/* Create preview (blue dashed) */}
        {isCreating && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3/4 rounded-sm border-2 border-dashed border-blue-500 bg-blue-500/20 pointer-events-none z-20"
            style={{
              left: createPreviewLeft,
              width: Math.max(createPreviewWidth, zoomLevel),
            }}
          />
        )}

        {/* Existing bar — z-10 so it sits above grid but below stacked subitems (z-20+) */}
        {hasDates && (
          <div className="absolute inset-0 z-10 pointer-events-none">
            <GanttBar
              left={barLeft}
              width={barWidth}
              color={getTaskColor(task)}
              label={task.name}
              showLabel={showLabels}
              zoomLevel={zoomLevel}
              isSubitem={isSubitem}
              dragState={dragState}
              taskId={isSubitem ? (parentTaskId || '') : task.id}
              subitemId={isSubitem ? task.id : null}
              onMouseDown={(e, type) =>
                onMouseDown(
                  e,
                  isSubitem ? (parentTaskId || task.id) : task.id,
                  projectId,
                  type,
                  isSubitem ? task.id : null,
                  isSubitem ? 'expanded' : 'parent',
                  normalizedStart,
                  taskDuration,
                )
              }
            />
          </div>
        )}

        {/* Collapsed subitem stack */}
        {isCollapsed && hasSubitems && (
          <GanttSubitemStack
            subitems={(task as Item).subitems}
            parentTaskId={task.id}
            projectId={projectId}
            zoomLevel={zoomLevel}
            rowHeight={actualRowHeight}
            showLabels={showLabels}
            getRelativeIndex={getRelativeIndex}
            dayToVisualIndex={dayToVisualIndex}
            getColor={getTaskColor}
            dragState={dragState}
            canEdit={canEdit}
            onMouseDown={onMouseDown}
          />
        )}
      </div>

      {/* Reorder drop indicator */}
      {isDropTarget && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 z-50 pointer-events-none"
          style={{
            top: reorderDrag?.dropPosition === 'before' ? '-1px' : 'auto',
            bottom: reorderDrag?.dropPosition === 'after' ? '-1px' : 'auto',
          }}
        />
      )}
    </div>
  );
}
