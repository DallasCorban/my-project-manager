// Board view — the main table view container.
// Renders group sections for the active project with drag & drop reordering.

import { useCallback, useRef } from 'react';
import { Plus } from 'lucide-react';
import { DndContext, MeasuringStrategy } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';

import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useBoardColumns } from '../../hooks/useBoardColumns';
import { useSortableSensors, sortableCollisionDetection } from '../../hooks/useSmartSensors';
import { GroupSection } from './GroupSection';
import type { Board } from '../../types/board';

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
}

export function BoardView({ project }: BoardViewProps) {
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
    reorderTasks,
    moveTaskToGroup,
    reorderSubitems,
    reorderGroups,
  } = useProjectContext();

  const { statuses, setStatuses, jobTypes, setJobTypes, activeEntityId } = useWorkspaceContext();

  const boardColumns = useTimelineStore((s) => s.getBoardColumns(activeEntityId));
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

  /** Groups that were open before a group drag started — restored on drop. */
  const preGroupDragOpen = useRef<string[]>([]);

  // --- dnd-kit row reorder ---
  const sensors = useSortableSensors();

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as { type?: string } | undefined;
    if (data?.type === 'group') {
      // Collapse all groups — monday.com style: only headers visible while dragging.
      // Save currently-open groups so we can restore them on drop.
      const allIds = project.groups.map((g) => g.id);
      preGroupDragOpen.current = allIds.filter((id) => !collapsedGroups.includes(id));
      setCollapsedGroups(allIds);
    }
  }, [project, collapsedGroups, setCollapsedGroups]);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const activeData = active.data.current as { type: string; groupId?: string; parentTaskId?: string } | undefined;
      const overData = over?.data.current as { type: string; groupId?: string } | undefined;

      // Always restore group open/close state after a group drag ends
      if (activeData?.type === 'group') {
        const allIds = project.groups.map((g) => g.id);
        setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
        preGroupDragOpen.current = [];
      }

      if (over && active.id !== over.id && activeData && overData) {
        if (activeData.type === 'group' && overData.type === 'group') {
          const fromIndex = project.groups.findIndex((g) => g.id === active.id);
          const toIndex = project.groups.findIndex((g) => g.id === over.id);
          if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            reorderGroups(project.id, fromIndex, toIndex);
          }
        } else if (activeData.type === 'task' && overData.type === 'task') {
          const sourceGroupId = activeData.groupId ?? '';
          const targetGroupId = overData.groupId ?? '';

          if (sourceGroupId === targetGroupId) {
            const groupTasks = project.tasks.filter((t) => t.groupId === sourceGroupId);
            const fromIndex = groupTasks.findIndex((t) => t.id === active.id);
            const toIndex = groupTasks.findIndex((t) => t.id === over.id);
            if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
              reorderTasks(project.id, sourceGroupId, fromIndex, toIndex);
            }
          } else {
            const targetGroupTasks = project.tasks.filter((t) => t.groupId === targetGroupId);
            const toIndex = targetGroupTasks.findIndex((t) => t.id === over.id);
            moveTaskToGroup(project.id, String(active.id), sourceGroupId, targetGroupId, toIndex);
          }
        } else if (activeData.type === 'task' && overData.type === 'subitem') {
          // Task dropped over an expanded subitem — route to the subitem's parent task.
          // This happens when expanded subitems occupy the drop zone between parent rows.
          const parentTask = project.tasks.find((t) =>
            t.subitems.some((s) => s.id === over.id),
          );
          if (parentTask && parentTask.id !== String(active.id)) {
            const sourceGroupId = activeData.groupId ?? '';
            const targetGroupId = parentTask.groupId;
            const groupTasks = project.tasks.filter((t) => t.groupId === targetGroupId);
            const fromIndex = groupTasks.findIndex((t) => t.id === active.id);
            const toIndex = groupTasks.findIndex((t) => t.id === parentTask.id);
            if (sourceGroupId === targetGroupId) {
              if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
                reorderTasks(project.id, targetGroupId, fromIndex, toIndex);
              }
            } else if (toIndex >= 0) {
              moveTaskToGroup(project.id, String(active.id), sourceGroupId, targetGroupId, toIndex);
            }
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
  }, [project, setCollapsedGroups]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sortableCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
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
            const groupTasks = project.tasks.filter((t) => t.groupId === group.id);

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
                      onOpenDatePicker={(taskId, subId) =>
                        openDatePicker({ taskId, subitemId: subId, projectId: project.id })
                      }
                      onOpenUpdates={(taskId, subId) =>
                        toggleUpdatesPanel({ taskId, subitemId: subId, projectId: project.id })
                      }
                      canEdit={true}
                      dragHandleListeners={groupListeners}
                    />
                  </div>
                )}
              </SortableGroupContainer>
            );
          })}
        </SortableContext>

        {/* Add group button */}
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
      </div>

    </DndContext>
  );
}
