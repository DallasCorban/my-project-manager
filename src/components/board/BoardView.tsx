// Board view — the main table view container.
// Renders group sections for the active project with drag & drop reordering.

import { useCallback, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';

import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useBoardColumns } from '../../hooks/useBoardColumns';
import { useSortableSensors, sortableCollisionDetection } from '../../hooks/useSmartSensors';
import { GroupSection } from './GroupSection';
import type { Board } from '../../types/board';
import type { Item } from '../../types/item';

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

export function BoardView({ project, canEdit = true }: BoardViewProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const setCollapsedGroups = useUIStore((s) => s.setCollapsedGroups);
  const openDatePicker = useUIStore((s) => s.openDatePicker);
  const toggleUpdatesPanel = useUIStore((s) => s.toggleUpdatesPanel);

  const {
    updateTaskName,
    updateSubitemName,
    updateGroupName,
    addTaskToGroup,
    addSubitem,
    addGroup,
    changeStatus,
    changeJobType,
    toggleAssignee,
    reorderTasks,
    moveTaskToGroup,
    reorderSubitems,
    reorderGroups,
  } = useProjectContext();

  const { statuses, setStatuses, jobTypes, setJobTypes, activeEntityId } = useWorkspaceContext();

  const boardColumns = useTimelineStore((s) => s.getBoardColumns(activeEntityId));
  const columnOrder = useTimelineStore((s) => s.getColumnOrder(activeEntityId));
  const setColumnOrder = useTimelineStore((s) => s.setColumnOrder);
  const setBoardColumns = useTimelineStore((s) => s.setBoardColumns);

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
  /** The original groupId of the actively-dragged task (before any cross-group moves). */
  const originalGroupIdRef = useRef<string | null>(null);
  /** The `over` item id from the most recent cross-group insertion.
   *  Used to suppress the immediate within-group reorder that fires when the
   *  ghost naturally overlaps the adjacent item after being inserted. */
  const crossGroupOverRef = useRef<string | null>(null);

  // Use dragTasks during drag so SortableContexts reflect cross-group moves.
  const effectiveTasks = dragTasks ?? project.tasks;

  // The actively-dragged task (for DragOverlay rendering).
  const activeTask: Item | null = activeId
    ? (effectiveTasks.find((t) => t.id === activeId) ?? null)
    : null;

  // --- dnd-kit row reorder ---
  const sensors = useSortableSensors();

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as { type?: string; groupId?: string } | undefined;
    if (data?.type === 'group') {
      // Collapse all groups — monday.com style: only headers visible while dragging.
      const allIds = project.groups.map((g) => g.id);
      preGroupDragOpen.current = allIds.filter((id) => !collapsedGroups.includes(id));
      setCollapsedGroups(allIds);
    }
    if (data?.type === 'task') {
      setActiveId(String(active.id));
      setDragTasks([...project.tasks]);
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
      if (!over || active.id === over.id) return;
      const activeData = active.data.current as { type?: string } | undefined;
      if (activeData?.type !== 'task') return;

      const origGroup = originalGroupIdRef.current;

      setDragTasks((prev) => {
        if (!prev) return prev;

        const overData = over.data.current as { type?: string; groupId?: string } | undefined;
        const overType = overData?.type;

        // Determine which group the cursor is over.
        let targetGroupId: string | undefined;
        if (overType === 'task') {
          const overTask = prev.find((t) => t.id === over.id);
          targetGroupId = overTask?.groupId;
        } else if (overType === 'group-drop-zone') {
          targetGroupId = overData?.groupId;
        } else if (overType === 'subitem') {
          const parentTask = prev.find((t) => t.subitems.some((s) => s.id === over.id));
          targetGroupId = parentTask?.groupId;
        }
        if (!targetGroupId) return prev;

        const activeIdx = prev.findIndex((t) => t.id === active.id);
        if (activeIdx < 0) return prev;
        const currentGroupId = prev[activeIdx].groupId;

        if (currentGroupId === targetGroupId) {
          // Within-group reorder — only keep dragTasks in sync if the item has
          // already crossed groups (otherwise dnd-kit handles visual displacement
          // and we don't want to fight it).
          if (origGroup && currentGroupId !== origGroup && overType === 'task') {
            // After a cross-group insertion, the ghost naturally overlaps the
            // adjacent item (they're touching). The collision is noise, not an
            // intentional reposition — skip it to prevent an unwanted swap.
            if (crossGroupOverRef.current === String(over.id)) {
              return prev;
            }
            // User has moved to a genuinely different item — clear the guard.
            crossGroupOverRef.current = null;

            const overIdx = prev.findIndex((t) => t.id === over.id);
            if (overIdx >= 0 && activeIdx !== overIdx) {
              const next = [...prev];
              const [moved] = next.splice(activeIdx, 1);
              next.splice(overIdx, 0, moved);
              return next;
            }
          }
          return prev;
        }

        // Cross-group move — move active task to the target group, placed near
        // the 'over' item so the SortableContext ordering matches visual intent.
        //
        // Direction matters: when dragging UP (active was below over in the flat
        // array), the ghost enters from below and overlaps the bottom items first.
        // Inserting AFTER the over item matches the user's visual intent (the
        // displaced item shifts down). When dragging DOWN, inserting BEFORE is
        // correct (the displaced item shifts up).
        //
        // Record the over item so the within-group guard can suppress the
        // immediate adjacent-item collision after this insertion.
        crossGroupOverRef.current = overType === 'task' ? String(over.id) : null;

        const overIdxInPrev = overType === 'task'
          ? prev.findIndex((t) => t.id === over.id)
          : -1;

        const next = [...prev];
        const [moved] = next.splice(activeIdx, 1);
        const movedTask = { ...moved, groupId: targetGroupId };

        if (overType === 'task') {
          const overIdx = next.findIndex((t) => t.id === over.id);
          if (overIdx < 0) {
            next.push(movedTask);
          } else if (activeIdx > overIdxInPrev) {
            // Dragging UP — insert AFTER the over item
            next.splice(overIdx + 1, 0, movedTask);
          } else {
            // Dragging DOWN — insert BEFORE the over item
            next.splice(overIdx, 0, movedTask);
          }
        } else {
          // Dropping into empty group or subitem — append at end of that group.
          const lastInGroup = next.reduce(
            (acc, t, i) => (t.groupId === targetGroupId ? i : acc),
            -1,
          );
          next.splice(lastInGroup + 1, 0, movedTask);
        }
        return next;
      });
    },
    [],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const activeData = active.data.current as { type: string; groupId?: string; parentTaskId?: string } | undefined;

      // Always restore group open/close state after a group drag ends
      if (activeData?.type === 'group') {
        const allIds = project.groups.map((g) => g.id);
        setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
        preGroupDragOpen.current = [];
      }

      if (activeData?.type === 'task' && dragTasks) {
        const originalGroupId = originalGroupIdRef.current ?? activeData.groupId ?? '';
        const movedTask = dragTasks.find((t) => t.id === active.id);
        const finalGroupId = movedTask?.groupId ?? originalGroupId;

        if (originalGroupId === finalGroupId) {
          // Same-group reorder — dnd-kit handled visual displacement; use
          // original project.tasks + over.id for stable arrayMove indices.
          if (over && active.id !== over.id) {
            const groupTasks = project.tasks.filter((t) => t.groupId === finalGroupId);
            const fromIndex = groupTasks.findIndex((t) => t.id === active.id);
            const overData = over.data.current as { type?: string; groupId?: string } | undefined;

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
          // Cross-group move — dragTasks has been kept in sync with the visual
          // order throughout the drag (via onDragOver), so we read the final
          // position directly from the array. No guessing from over.id needed.
          const targetGroupTasks = dragTasks.filter((t) => t.groupId === finalGroupId);
          const activeIdxInGroup = targetGroupTasks.findIndex((t) => t.id === String(active.id));
          const toIndex = activeIdxInGroup >= 0 ? activeIdxInGroup : targetGroupTasks.length;
          moveTaskToGroup(project.id, String(active.id), originalGroupId, finalGroupId, toIndex);
        }

        setDragTasks(null);
        setActiveId(null);
        originalGroupIdRef.current = null;
        crossGroupOverRef.current = null;
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
    [project, dragTasks, reorderGroups, reorderTasks, moveTaskToGroup, reorderSubitems, setCollapsedGroups],
  );

  /** Called when the user cancels a drag (e.g. presses Escape). */
  const handleDragCancel = useCallback(() => {
    if (preGroupDragOpen.current.length > 0) {
      const allIds = project.groups.map((g) => g.id);
      setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
      preGroupDragOpen.current = [];
    }
    setDragTasks(null);
    setActiveId(null);
    originalGroupIdRef.current = null;
    crossGroupOverRef.current = null;
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
                      onStartResize={handleStartResize}
                      onUpdateGroupName={(name) => updateGroupName(project.id, group.id, name)}
                      onUpdateTaskName={(taskId, name) => updateTaskName(project.id, taskId, name)}
                      onUpdateSubitemName={(taskId, subId, name) =>
                        updateSubitemName(project.id, taskId, subId, name)
                      }
                      onStatusSelect={(taskId, subId, statusId) =>
                        changeStatus(project.id, taskId, subId, statusId)
                      }
                      onTypeSelect={(taskId, subId, typeId) =>
                        changeJobType(project.id, taskId, subId, typeId)
                      }
                      onAddTaskToGroup={(name) => addTaskToGroup(project.id, group.id, name)}
                      onAddSubitem={addSubitem}
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
                      onToggleAssignee={(taskId, subId, uid) =>
                        toggleAssignee(project.id, taskId, subId, uid)
                      }
                      onOpenDatePicker={(taskId, subId) =>
                        openDatePicker({ taskId, subitemId: subId, projectId: project.id })
                      }
                      onOpenUpdates={(taskId, subId) =>
                        toggleUpdatesPanel({ taskId, subitemId: subId, projectId: project.id })
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
      <DragOverlay dropAnimation={null}>
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
