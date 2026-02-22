// GanttTaskRow — a single task row in the Gantt view.
// Left side: label column (name, etc.) — acts as the drag handle for row reorder.
// Right side: bar area with day grid + GanttBar + creation preview.

import { Square, CheckSquare } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { useUIStore } from '../../stores/uiStore';
import { ItemLabelCell } from '../shared/ItemLabelCell';
import { GanttBar } from './GanttBar';
import { GanttSubitemStack } from './GanttSubitemStack';
import { normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { TimelineDay, DragState } from '../../types/timeline';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';
import type { SettledOverride } from '../../hooks/useGanttDrag';

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
  getRelativeIndex: (dateKey: string | null | undefined) => number | null;
  dayToVisualIndex: Record<number, number>;
  dragState: DragState;
  settledOverrides: Record<string, SettledOverride>;
  clearSettledOverride: (key: string) => void;
  canEdit: boolean;
  /** When true, renders a blue drop-indicator line at the row edge. */
  isDropTarget?: boolean;
  /** When true the indicator renders at the bottom edge (dragging down);
   *  otherwise at the top edge (dragging up). Corrects the visual off-by-one
   *  caused by arrayMove removing-then-inserting when moving downward. */
  dropBelow?: boolean;
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
  // Label column handlers
  onUpdateName: (value: string) => void;
  onStatusSelect: (statusId: string) => void;
  onTypeSelect: (typeId: string) => void;
  onOpenUpdates?: () => void;
  onAddSubitem?: (projectId: string, taskId: string) => void;
  /** True when this row's bar is the current zoom-anchor selection. */
  isBarSelected?: boolean;
  /** Called when the user clicks this bar to select it as the zoom anchor. */
  onSelect?: () => void;
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
  settledOverrides,
  clearSettledOverride,
  canEdit,
  isDropTarget = false,
  dropBelow = false,
  onMouseDown,
  onUpdateName,
  onStatusSelect: _onStatusSelect,
  onTypeSelect: _onTypeSelect,
  onOpenUpdates,
  onAddSubitem,
  isBarSelected = false,
  onSelect,
}: GanttTaskRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const toggleSelection = useUIStore((s) => s.toggleSelection);

  const isSelected = selectedItems.has(task.id);

  // dnd-kit sortable — listeners spread on left label column (drag handle only).
  // We do NOT apply transform to the row because that would break position:sticky
  // on the left column. Instead the DragOverlay shows a floating task-name chip.
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: isSubitem ? 'subitem' : 'task',
      projectId,
      groupId: !isSubitem ? (task as Item).groupId : undefined,
      parentTaskId: isSubitem ? parentTaskId : undefined,
    },
    disabled: !canEdit,
  });

  // Single-clicking the empty whitespace of the left label column toggles the
  // updates panel for this row's item — consistent with Board view's row click.
  // dnd-kit's PointerSensor only activates after 4 px of movement so a plain
  // click never accidentally starts a drag.  Interactive children (buttons,
  // checkbox, contenteditable) are excluded via the same guard used in TaskRow.
  const handleLabelClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive =
      ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(target.tagName) ||
      !!target.closest('button') ||
      !!target.closest('[data-no-dnd]') ||
      target.getAttribute('contenteditable') === 'true';
    if (isInteractive) return;
    onOpenUpdates?.();
  };

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

  const isThisBarDragging =
    dragState.isDragging &&
    dragState.type !== 'create' &&
    dragState.hasMoved &&
    (isSubitem
      ? dragState.subitemId === task.id
      : dragState.taskId === task.id && dragState.subitemId === null);

  let barLeft = 0;
  let barWidth = 0;

  const settledKey = isSubitem ? `${parentTaskId}:${task.id}` : task.id;
  const settled = settledOverrides[settledKey];

  if (isThisBarDragging) {
    barLeft = dragState.visualLeft;
    barWidth = dragState.visualWidth;
  } else if (hasDates && normalizedStart) {
    const relIdx = getRelativeIndex(normalizedStart);
    if (relIdx !== null) {
      const startVisual = dayToVisualIndex[relIdx];
      if (startVisual !== undefined) {
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
    }
  }

  if (settled && !isThisBarDragging) {
    barLeft = settled.visualLeft;
    barWidth = settled.visualWidth;
  }

  const isCreating =
    dragState.isDragging &&
    dragState.type === 'create' &&
    dragState.taskId === task.id &&
    dragState.subitemId === (isSubitem ? task.id : null);

  let createPreviewLeft = 0;
  let createPreviewWidth = 0;
  if (isCreating) {
    const origVisStart = dayToVisualIndex[dragState.originalStart];
    if (origVisStart !== undefined) {
      createPreviewLeft = origVisStart * zoomLevel;
      createPreviewWidth = dragState.currentSpan * zoomLevel;
    }
  }

  const actualRowHeight = rowHeight;
  const hasSubitems = !isSubitem && 'subitems' in task && (task as Item).subitems.length > 0;
  const isCollapsed = hasSubitems && !expandedItems.includes(task.id);

  // Sub-items get a subtly different base background so hierarchy is scannable.
  const labelBg = darkMode
    ? isSubitem ? 'bg-[#181c38]' : 'bg-[#1c213e]'
    : isSubitem ? 'bg-[#f2f4fb]' : 'bg-white';

  return (
    <div
      ref={setNodeRef}
      className={`flex relative group ${
        isDragging ? 'opacity-50' : ''
      } ${
        darkMode
          ? 'border-b border-[#2b2c32] hover:bg-[#202336]'
          : 'border-b border-[#eceff8] hover:bg-[#f0f0f0]'
      } ${
        isBarSelected
          ? darkMode ? 'bg-blue-500/10' : 'bg-blue-50'
          : isSubitem
            ? darkMode ? 'bg-[#181c38]' : 'bg-[#f2f4fb]'
            : ''
      }`}
      style={{ height: actualRowHeight }}
      {...attributes}
    >
      {/* Drop indicator — blue line showing where the item will land.
          Renders at top when dragging UP, bottom when dragging DOWN. This
          corrects for arrayMove's remove-then-insert behaviour which places
          the item one slot below the target when moving downward. */}
      {isDropTarget && (
        <div className={`absolute inset-x-0 ${dropBelow ? 'bottom-0' : 'top-0'} h-0.5 bg-blue-500 z-50 pointer-events-none`} />
      )}

      {/* Left label column — sticky, spread listeners here to make it the drag handle.
          touch-action:none prevents iOS from intercepting touch as scroll during drag. */}
      <div
        className={`sticky left-0 z-[200] flex items-center shrink-0 border-r px-3 overflow-hidden ${
          isDragging ? 'cursor-grabbing' : canEdit ? 'cursor-grab' : ''
        } ${labelBg} ${
          darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'
        }`}
        style={{ width: 320, minWidth: 320, touchAction: 'none' }}
        onClick={handleLabelClick}
        {...listeners}
      >
        {/* Checkbox — data-no-dnd prevents SmartPointerSensor from consuming the click */}
        <div className="shrink-0 mr-1 flex items-center" data-no-dnd>
          <div
            className={`cursor-pointer transition-all ${
              isSelected
                ? 'text-blue-500 opacity-100'
                : 'text-gray-400 opacity-0 group-hover:opacity-100'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelection(task.id);
            }}
          >
            {isSelected ? <CheckSquare size={15} /> : <Square size={15} />}
          </div>
        </div>

        <ItemLabelCell
          task={task}
          isSubitem={isSubitem}
          canEdit={canEdit}
          darkMode={darkMode}
          onUpdateName={canEdit ? onUpdateName : undefined}
          onAddSubitem={onAddSubitem && !isSubitem ? () => onAddSubitem(projectId, task.id) : undefined}
          onOpenUpdates={onOpenUpdates}
        />
      </div>

      {/* Right bar area — scrollable with timeline. overflow: visible so
          offset bars in collapsed stacks aren't clipped at row edges.
          offset bars in collapsed stacks aren't clipped at row edges. */}
      <div
        className="relative flex-1 min-w-0"
        style={{ minWidth: visibleDays.length * zoomLevel, overflow: 'visible' }}
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
            onPointerDown={(e) =>
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
            className="absolute rounded-sm border-2 border-dashed border-blue-500 bg-blue-500/20 pointer-events-none z-20"
            style={{
              left: createPreviewLeft,
              width: Math.max(createPreviewWidth, zoomLevel),
              height: Math.max(14, Math.min(24, Math.round(actualRowHeight * 0.72))),
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        )}

        {/* Existing bar */}
        {barWidth > 0 && !isCollapsed && (
          <div className="absolute inset-0 z-10 pointer-events-none" style={{ overflow: 'visible' }}>
            <GanttBar
              left={barLeft}
              width={barWidth}
              color={getTaskColor(task)}
              label={task.name}
              showLabel={showLabels}
              zoomLevel={zoomLevel}
              rowHeight={actualRowHeight}
              verticalOffsetPx={0}
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
              isSelected={isBarSelected}
              onSelect={onSelect}
              onOpenUpdates={onOpenUpdates}
            />
          </div>
        )}

        {/* Collapsed stack — unified parent + subitem bar layout */}
        {isCollapsed && hasSubitems && (
          <GanttSubitemStack
            parentTask={task as Item}
            parentTaskId={task.id}
            projectId={projectId}
            zoomLevel={zoomLevel}
            rowHeight={actualRowHeight}
            showLabels={showLabels}
            getRelativeIndex={getRelativeIndex}
            dayToVisualIndex={dayToVisualIndex}
            getColor={getTaskColor}
            dragState={dragState}
            settledOverrides={settledOverrides}
            clearSettledOverride={clearSettledOverride}
            canEdit={canEdit}
            onMouseDown={onMouseDown}
          />
        )}
      </div>
    </div>
  );
}
