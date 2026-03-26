// Board view — the main table view container.
// Renders group sections for the active project with drag & drop reordering.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, DragOverEvent, DropAnimation } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';

import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useBoardColumns } from '../../hooks/useBoardColumns';
import { useSortableSensors, sortableCollisionDetection } from '../../hooks/useSmartSensors';
import { GroupSection } from './GroupSection';
import { DEFAULT_BOARD_COLUMNS, DEFAULT_COLUMN_ORDER } from '../../config/constants';
import type { Board } from '../../types/board';
import type { Item } from '../../types/item';
import type { ClientRect } from '@dnd-kit/core';

/**
 * Render-prop wrapper for useSortable on group headers.
 * Extracted as a component because hooks cannot be called inside .map() loops.
 * Board groups CAN use CSS transform (no sticky breakage here).
 */
type SortableGroupData = ReturnType<typeof useSortable>;
function SortableGroupContainer({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (
    isDragging: boolean,
    listeners: SortableGroupData['listeners'],
    setNodeRef: SortableGroupData['setNodeRef'],
    attributes: SortableGroupData['attributes'],
    transform: SortableGroupData['transform'],
    transition: SortableGroupData['transition'],
  ) => React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, isDragging, transform, transition } = useSortable({
    id,
    data: { type: 'group' },
    disabled,
  });
  return <>{children(isDragging, listeners, setNodeRef, attributes, transform, transition)}</>;
}

interface BoardViewProps {
  project: Board;
  canEdit?: boolean;
}

const TASK_DROP_ANIMATION: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0',
      },
    },
  }),
};

function getDraggedMidpoint(rect: ClientRect | null | undefined) {
  if (!rect) return null;
  return rect.top + rect.height / 2;
}

function getTaskRowMidpoint(taskId: string) {
  if (typeof document === 'undefined') return null;
  const row = document.querySelector<HTMLElement>(`[data-task-row-id="${taskId}"]`);
  if (!row) return null;
  const rect = row.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function getVisualDropIndex(groupId: string, activeTaskId: string, draggedMidpoint: number | null) {
  if (typeof document === 'undefined' || draggedMidpoint === null) return null;

  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-task-group-id="${groupId}"]`),
  )
    .filter((row) => row.dataset.taskRowId !== activeTaskId)
    .map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        top: rect.top,
        midpoint: rect.top + rect.height / 2,
      };
    })
    .sort((a, b) => a.top - b.top);

  if (rows.length === 0) return 0;

  const firstRowBelow = rows.findIndex((row) => draggedMidpoint < row.midpoint);
  return firstRowBelow >= 0 ? firstRowBelow : rows.length;
}

export function BoardView({ project, canEdit = true }: BoardViewProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const setCollapsedGroups = useUIStore((s) => s.setCollapsedGroups);
  const openDatePicker = useUIStore((s) => s.openDatePicker);
  const toggleUpdatesPanel = useUIStore((s) => s.toggleUpdatesPanel);

  const {
    updateTaskName,
    updateSubitemName,
    updateSubSubitemName,
    updateGroupName,
    addTaskToGroup,
    addSubitem,
    addSubSubitem,
    addGroup,
    changeStatus,
    changeJobType,
    changeItemType,
    toggleAssignee,
    reorderTasks,
    moveTaskToGroup,
    reorderSubitems,
    reorderGroups,
  } = useProjectContext();

  const { statuses, setStatuses, jobTypes, setJobTypes, itemTypes, setItemTypes, activeEntityId } = useWorkspaceContext();

  const rawBoardColumns = useTimelineStore((s) => s.getBoardColumns(activeEntityId));
  const rawColumnOrder = useTimelineStore((s) => s.getColumnOrder(activeEntityId));
  const setColumnOrder = useTimelineStore((s) => s.setColumnOrder);
  const setBoardColumns = useTimelineStore((s) => s.setBoardColumns);

  // Ensure persisted columns/order include any newly added keys (e.g. itemType)
  const boardColumns = useMemo(
    () => ({ ...DEFAULT_BOARD_COLUMNS, ...rawBoardColumns }),
    [rawBoardColumns],
  );
  const columnOrder = useMemo(() => {
    const missing = DEFAULT_COLUMN_ORDER.filter((k) => !rawColumnOrder.includes(k));
    return missing.length > 0 ? [...rawColumnOrder, ...missing] : rawColumnOrder;
  }, [rawColumnOrder]);

  const { handleStartResize } = useBoardColumns(boardColumns, (cols) =>
    setBoardColumns(activeEntityId, cols),
  );

  // Status/type label management
  const handleAddStatusLabel = (label: string, color: string) => {
    const id = label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    setStatuses((prev) => [...prev, { id, label, color }]);
  };

  const handleAddTypeLabel = (label: string, color: string) => {
    const id = label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    setJobTypes((prev) => [...prev, { id, label, color }]);
  };

  const handleRenameStatusLabel = (id: string, newLabel: string) =>
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, label: newLabel } : s)));
  const handleRenameTypeLabel = (id: string, newLabel: string) =>
    setJobTypes((prev) => prev.map((t) => (t.id === id ? { ...t, label: newLabel } : t)));
  const handleReorderStatuses = (reordered: typeof statuses) => setStatuses(reordered);
  const handleReorderTypes = (reordered: typeof jobTypes) => setJobTypes(reordered);
  const handleUpdateStatusColor = (id: string, color: string) =>
    setStatuses((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
  const handleUpdateTypeColor = (id: string, color: string) =>
    setJobTypes((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));

  const handleToggleTypeContainer = (id: string) =>
    setJobTypes((prev) => prev.map((t) => (t.id === id ? { ...t, isContainer: !t.isContainer } : t)));

  /** Groups that were open before a group drag started — restored on drop. */
  const preGroupDragOpen = useRef<string[]>([]);

  // --- Cross-group drag state ---
  // During a task drag, we maintain a local copy of the tasks array so we can
  // optimistically move items between groups. This lets dnd-kit's SortableContext
  // see the item in the target group, producing smooth shuffle animations.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragTasks, setDragTasks] = useState<Item[] | null>(null);
  const dragTasksRef = useRef<Item[] | null>(null);
  /** The original groupId of the actively-dragged task (before any cross-group moves). */
  const originalGroupIdRef = useRef<string | null>(null);

  // Use dragTasks during drag so SortableContexts reflect cross-group moves.
  const effectiveTasks = dragTasks ?? project.tasks;
  const orderedGroupIds = useMemo(() => project.groups.map((group) => group.id), [project.groups]);

  // The actively-dragged task (for DragOverlay rendering).
  const activeTask: Item | null = activeId
    ? (effectiveTasks.find((t) => t.id === activeId) ?? null)
    : null;

  // --- dnd-kit row reorder ---
  const sensors = useSortableSensors();

  const buildPreviewTasks = useCallback((tasks: Item[], movedTask: Item, targetGroupId: string, targetIndex: number) => {
    const groupedTasks = new Map<string, Item[]>();
    orderedGroupIds.forEach((groupId) => groupedTasks.set(groupId, []));

    const extras: Item[] = [];

    tasks.forEach((task) => {
      if (task.id === movedTask.id) return;
      const bucket = groupedTasks.get(task.groupId);
      if (bucket) {
        bucket.push(task);
      } else {
        extras.push(task);
      }
    });

    const targetTasks = groupedTasks.get(targetGroupId) ?? [];
    const clampedIndex = Math.max(0, Math.min(targetIndex, targetTasks.length));
    targetTasks.splice(clampedIndex, 0, movedTask);
    groupedTasks.set(targetGroupId, targetTasks);

    return [...orderedGroupIds.flatMap((groupId) => groupedTasks.get(groupId) ?? []), ...extras];
  }, [orderedGroupIds]);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as { type?: string; groupId?: string } | undefined;
    if (data?.type === 'group') {
      // Collapse all groups — monday.com style: only headers visible while dragging.
      const allIds = project.groups.map((g) => g.id);
      preGroupDragOpen.current = allIds.filter((id) => !collapsedGroups.includes(id));
      setCollapsedGroups(allIds);
    }
    if (data?.type === 'task') {
      const initialDragTasks = [...project.tasks];
      setActiveId(String(active.id));
      dragTasksRef.current = initialDragTasks;
      setDragTasks(initialDragTasks);
      originalGroupIdRef.current = data.groupId ?? null;
    }
  }, [project, collapsedGroups, setCollapsedGroups]);

  /**
   * Move task between groups — AND reorder within the target group — in real-time
   * so the SortableContext stays in sync and shuffle animations are correct.
   *
   * After a cross-group move, within-group `onDragOver` events continue to fire
   * as the user repositions within the new group. We update dragTasks for those
   * too, so at drop-time we can read the final position directly from the array
   * instead of guessing from `over.id` (which caused off-by-one errors).
   */
  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      if (!over) return;
      const activeData = active.data.current as { type?: string } | undefined;
      if (activeData?.type !== 'task') return;

      const origGroup = originalGroupIdRef.current;

      setDragTasks((prev) => {
        if (!prev) return prev;

        const overData = over.data.current as { type?: string; groupId?: string } | undefined;
        const overType = overData?.type;
        const translatedMidpoint = getDraggedMidpoint(active.rect.current.translated);

        // Determine which group the cursor is over.
        let targetGroupId: string | undefined;
        let anchorTaskId: string | null = null;
        if (String(over.id) === String(active.id)) {
          const activeTask = prev.find((t) => t.id === active.id);
          targetGroupId = activeTask?.groupId;
        } else if (overType === 'task') {
          const overTask = prev.find((t) => t.id === over.id);
          targetGroupId = overTask?.groupId;
          anchorTaskId = overTask?.id ?? null;
        } else if (overType === 'group-drop-zone') {
          targetGroupId = overData?.groupId;
        } else if (overType === 'subitem') {
          const parentTask = prev.find((t) => t.subitems.some((s) => s.id === over.id));
          targetGroupId = parentTask?.groupId;
          anchorTaskId = parentTask?.id ?? null;
        }
        if (!targetGroupId) return prev;

        const activeIdx = prev.findIndex((t) => t.id === active.id);
        if (activeIdx < 0) return prev;
        const activeTaskInPrev = prev[activeIdx];
        const currentGroupId = activeTaskInPrev.groupId;
        const currentGroupTasks = prev.filter((t) => t.groupId === currentGroupId);
        const currentIndexInGroup = currentGroupTasks.findIndex((t) => t.id === active.id);

        // Within-group reorder — only keep dragTasks in sync if the item has
        // already crossed groups (otherwise dnd-kit handles visual displacement
        // and we don't want to fight it).
        if (currentGroupId === targetGroupId && (!origGroup || currentGroupId === origGroup)) {
          return prev;
        }

        const targetTasksWithoutActive = prev.filter(
          (task) => task.groupId === targetGroupId && task.id !== active.id,
        );

        let targetIndex = targetTasksWithoutActive.length;

        const firstTaskId = targetTasksWithoutActive[0]?.id;
        const lastTaskId = targetTasksWithoutActive[targetTasksWithoutActive.length - 1]?.id;
        const firstMidpoint = firstTaskId ? getTaskRowMidpoint(firstTaskId) : null;
        const lastMidpoint = lastTaskId ? getTaskRowMidpoint(lastTaskId) : null;

        if (
          translatedMidpoint !== null &&
          firstMidpoint !== null &&
          translatedMidpoint <= firstMidpoint
        ) {
          targetIndex = 0;
        } else if (
          translatedMidpoint !== null &&
          lastMidpoint !== null &&
          translatedMidpoint >= lastMidpoint
        ) {
          targetIndex = targetTasksWithoutActive.length;
        } else if (String(over.id) === String(active.id)) {
          // Stay put when dnd-kit reports the active placeholder itself as the
          // current collision target and we're not clearly beyond either edge.
          targetIndex = currentIndexInGroup;
        }

        if (anchorTaskId && targetIndex !== 0 && targetIndex !== targetTasksWithoutActive.length) {
          const anchorIndex = targetTasksWithoutActive.findIndex((task) => task.id === anchorTaskId);

          if (anchorIndex >= 0) {
            // Use the dragged card's translated midpoint, not the previous array
            // order, to decide before/after. This prevents the preview item from
            // "walking" past adjacent rows just because they became touch-adjacent
            // after a cross-group insertion.
            const overMidpoint = over.rect.top + over.rect.height / 2;
            const insertAfter = translatedMidpoint !== null && translatedMidpoint > overMidpoint;
            targetIndex = anchorIndex + (insertAfter ? 1 : 0);
          }
        }

        if (currentGroupId === targetGroupId && currentIndexInGroup === targetIndex) {
          return prev;
        }

        const movedTask = { ...activeTaskInPrev, groupId: targetGroupId };
        const next = buildPreviewTasks(prev, movedTask, targetGroupId, targetIndex);
        dragTasksRef.current = next;
        return next;
      });
    },
    [buildPreviewTasks],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const activeData = active.data.current as { type: string; groupId?: string; parentTaskId?: string } | undefined;
      const liveDragTasks = dragTasksRef.current;

      // Always restore group open/close state after a group drag ends
      if (activeData?.type === 'group') {
        const allIds = project.groups.map((g) => g.id);
        setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
        preGroupDragOpen.current = [];
      }

      if (activeData?.type === 'task' && liveDragTasks) {
        const originalGroupId = originalGroupIdRef.current ?? activeData.groupId ?? '';
        const movedTask = liveDragTasks.find((t) => t.id === active.id);
        const overData = over?.data.current as { type?: string; groupId?: string } | undefined;

        let finalGroupId = movedTask?.groupId ?? originalGroupId;
        if (overData?.type === 'task') {
          finalGroupId = overData.groupId ?? finalGroupId;
        } else if (overData?.type === 'group-drop-zone') {
          finalGroupId = overData.groupId ?? finalGroupId;
        } else if (overData?.type === 'subitem') {
          const parentTask = liveDragTasks.find((t) => t.subitems.some((s) => s.id === over?.id));
          finalGroupId = parentTask?.groupId ?? finalGroupId;
        }

        if (originalGroupId === finalGroupId) {
          // Same-group reorder — dnd-kit handled visual displacement; use
          // original project.tasks + over.id for stable arrayMove indices.
          if (over && active.id !== over.id) {
            const groupTasks = project.tasks.filter((t) => t.groupId === finalGroupId);
            const fromIndex = groupTasks.findIndex((t) => t.id === active.id);

            let toIndex = -1;
            if (overData?.type === 'task') {
              toIndex = groupTasks.findIndex((t) => t.id === over.id);
            } else if (overData?.type === 'subitem') {
              const parentTask = project.tasks.find((t) => t.subitems.some((s) => s.id === over.id));
              if (parentTask) toIndex = groupTasks.findIndex((t) => t.id === parentTask.id);
            }

            if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
              reorderTasks(project.id, finalGroupId, fromIndex, toIndex);
            }
          }
        } else {
          // Cross-group move — persist against the actual on-screen preview,
          // not just the optimistic array. dnd-kit can still show a transformed
          // edge slot even when the active placeholder is the current collision.
          const draggedMidpoint = getDraggedMidpoint(active.rect.current.translated);
          const visualIndex = getVisualDropIndex(finalGroupId, String(active.id), draggedMidpoint);
          const targetGroupTasks = project.tasks.filter(
            (t) => t.groupId === finalGroupId && t.id !== String(active.id),
          );
          const previewGroupTasks = liveDragTasks.filter((t) => t.groupId === finalGroupId);
          const previewIndex = previewGroupTasks.findIndex((t) => t.id === String(active.id));
          const fallbackIndex = previewIndex >= 0 ? previewIndex : targetGroupTasks.length;
          const toIndex = visualIndex ?? fallbackIndex;
          moveTaskToGroup(project.id, String(active.id), originalGroupId, finalGroupId, toIndex);
        }

        setDragTasks(null);
        dragTasksRef.current = null;
        setActiveId(null);
        originalGroupIdRef.current = null;
      } else if (over && active.id !== over.id && activeData) {
        const overData = over.data.current as { type: string; groupId?: string } | undefined;
        if (!overData) { /* no-op */ }
        else if (activeData.type === 'group' && overData.type === 'group') {
          const fromIndex = project.groups.findIndex((g) => g.id === active.id);
          const toIndex = project.groups.findIndex((g) => g.id === over.id);
          if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            reorderGroups(project.id, fromIndex, toIndex);
          }
        } else if (activeData.type === 'subitem' && overData.type === 'subitem') {
          const parentTask = project.tasks.find((t) =>
            t.subitems.some((s) => s.id === active.id),
          );
          if (parentTask) {
            const fromIndex = parentTask.subitems.findIndex((s) => s.id === active.id);
            const toIndex = parentTask.subitems.findIndex((s) => s.id === over.id);
            if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
              reorderSubitems(project.id, parentTask.id, fromIndex, toIndex);
            }
          }
        }
      }
    },
    [project, reorderGroups, reorderTasks, moveTaskToGroup, reorderSubitems, setCollapsedGroups],
  );

  /** Called when the user cancels a drag (e.g. presses Escape). */
  const handleDragCancel = useCallback(() => {
    if (preGroupDragOpen.current.length > 0) {
      const allIds = project.groups.map((g) => g.id);
      setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
      preGroupDragOpen.current = [];
    }
    setDragTasks(null);
    dragTasksRef.current = null;
    setActiveId(null);
    originalGroupIdRef.current = null;
  }, [project, setCollapsedGroups]);

  return (
    <DndContext
      sensors={canEdit ? sensors : []}
      collisionDetection={sortableCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex-1 overflow-auto p-6">
        {/* Outer SortableContext enables group-level drag reorder */}
        <SortableContext
          items={project.groups.map((g) => g.id)}
          strategy={verticalListSortingStrategy}
        >
          {project.groups.map((group) => {
            const groupTasks = effectiveTasks.filter((t) => t.groupId === group.id);

            return (
              <SortableGroupContainer key={group.id} id={group.id} disabled={false}>
                {(isGroupDragging, groupListeners, setGroupRef, groupAttributes, transform, transition) => (
                  <div
                    ref={setGroupRef}
                    {...groupAttributes}
                    style={{
                      transform: transform
                        ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
                        : undefined,
                      transition,
                      opacity: isGroupDragging ? 0.4 : 1,
                    }}
                  >
                    <GroupSection
                      group={group}
                      tasks={groupTasks}
                      project={project}
                      boardColumns={boardColumns}
                      columnOrder={columnOrder}
                      onReorderColumns={(order) => setColumnOrder(activeEntityId, order)}
                      statuses={statuses}
                      jobTypes={jobTypes}
                      itemTypes={itemTypes}
                      onStartResize={handleStartResize}
                      onUpdateGroupName={(name) => updateGroupName(project.id, group.id, name)}
                      onUpdateTaskName={(taskId, name) => updateTaskName(project.id, taskId, name)}
                      onUpdateSubitemName={(taskId, subId, name) =>
                        updateSubitemName(project.id, taskId, subId, name)
                      }
                      onUpdateSubSubitemName={(taskId, subId, ssId, name) =>
                        updateSubSubitemName(project.id, taskId, subId, ssId, name)
                      }
                      onStatusSelect={(taskId, subId, statusId, ssId) =>
                        changeStatus(project.id, taskId, subId, statusId, ssId ?? null)
                      }
                      onTypeSelect={(taskId, subId, typeId, ssId) =>
                        changeJobType(project.id, taskId, subId, typeId, ssId ?? null)
                      }
                      onItemTypeSelect={(taskId, subId, typeId, ssId) =>
                        changeItemType(project.id, taskId, subId, typeId, ssId ?? null)
                      }
                      onAddTaskToGroup={(name) => addTaskToGroup(project.id, group.id, name)}
                      onAddSubitem={addSubitem}
                      onAddSubSubitem={addSubSubitem}
                      onAddStatusLabel={handleAddStatusLabel}
                      onAddTypeLabel={handleAddTypeLabel}
                      onRemoveStatusLabel={(id) => setStatuses((prev) => prev.filter((s) => s.id !== id))}
                      onRemoveTypeLabel={(id) => setJobTypes((prev) => prev.filter((t) => t.id !== id))}
                      onRenameStatusLabel={handleRenameStatusLabel}
                      onRenameTypeLabel={handleRenameTypeLabel}
                      onReorderStatuses={handleReorderStatuses}
                      onReorderTypes={handleReorderTypes}
                      onUpdateStatusColor={handleUpdateStatusColor}
                      onUpdateTypeColor={handleUpdateTypeColor}
                      onToggleTypeContainer={handleToggleTypeContainer}
                      onToggleAssignee={(taskId, subId, uid, ssId) =>
                        toggleAssignee(project.id, taskId, subId, uid, ssId ?? null)
                      }
                      onOpenDatePicker={(taskId, subId, ssId) =>
                        openDatePicker({ taskId, subitemId: subId, subSubitemId: ssId ?? null, projectId: project.id })
                      }
                      onOpenUpdates={(taskId, subId, ssId) =>
                        toggleUpdatesPanel({ taskId, subitemId: subId, subSubitemId: ssId ?? null, projectId: project.id })
                      }
                      canEdit={canEdit}
                      dragHandleListeners={groupListeners}
                    />
                  </div>
                )}
              </SortableGroupContainer>
            );
          })}
        </SortableContext>

        {/* Add group button */}
        {canEdit && (
          <button
            onClick={() => addGroup(project.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              darkMode
                ? 'text-gray-400 hover:bg-[#202336] hover:text-gray-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <Plus size={16} /> Add Group
          </button>
        )}
      </div>

      {/* Floating drag overlay — task row ghost for cross-group drag */}
      <DragOverlay dropAnimation={TASK_DROP_ANIMATION}>
        {activeTask ? (
          <div
            className={`flex items-center gap-3 px-4 h-9 rounded shadow-xl border cursor-grabbing text-xs font-medium ${
              darkMode
                ? 'bg-[#1c213e] border-[#323652] text-gray-200'
                : 'bg-white border-[#d0d4e4] text-gray-700'
            }`}
            style={{ width: 320 }}
          >
            <span className="truncate">{activeTask.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
