// Board view — the main table view container.
// Renders group sections for the active project with drag & drop reordering.

import { useState, useCallback, useRef } from 'react';
import { Plus, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';

import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useBoardColumns } from '../../hooks/useBoardColumns';
import { useSortableSensors } from '../../hooks/useSmartSensors';
import { GroupSection } from './GroupSection';
import { ItemLabelCell } from '../shared/ItemLabelCell';
import type { Board, Group } from '../../types/board';
import type { Item, Subitem } from '../../types/item';

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
  const selectedItems = useUIStore((s) => s.selectedItems);
  const openDatePicker = useUIStore((s) => s.openDatePicker);
  const openUpdatesPanel = useUIStore((s) => s.openUpdatesPanel);

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
  const [activeId, setActiveId] = useState<string | null>(null);

  // Find the active group or item (task or subitem) for DragOverlay
  const activeGroup: Group | null = activeId
    ? (project.groups.find((g) => g.id === activeId) ?? null)
    : null;
  const activeGroupTaskCount = activeGroup
    ? project.tasks.filter((t) => t.groupId === activeGroup.id).length
    : 0;
  const activeItem: Item | Subitem | null = !activeGroup && activeId
    ? (project.tasks.find((t) => t.id === activeId) ??
       project.tasks.flatMap((t) => t.subitems).find((s) => s.id === activeId) ??
       null)
    : null;
  const activeIsSubitem = !activeGroup && activeId ? !project.tasks.some((t) => t.id === activeId) : false;
  const activeIsSelected = activeId ? selectedItems.has(activeId) : false;

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as { type?: string } | undefined;
    if (data?.type === 'group') {
      // Collapse all groups — monday.com style: only headers visible while dragging.
      // Save currently-open groups so we can restore them on drop.
      const allIds = project.groups.map((g) => g.id);
      preGroupDragOpen.current = allIds.filter((id) => !collapsedGroups.includes(id));
      setCollapsedGroups(allIds);
    }
    setActiveId(String(active.id));
  }, [project, collapsedGroups, setCollapsedGroups]);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // NOTE: setActiveId(null) is called at the END so the DragOverlay keeps its
      // content alive during dnd-kit's drop animation (which needs the overlay
      // snapshot to animate to the drop destination).

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

      // Clear last — keeps DragOverlay content alive for the drop animation
      setActiveId(null);
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
    setActiveId(null);
  }, [project, setCollapsedGroups]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
                        openUpdatesPanel({ taskId, subitemId: subId, projectId: project.id })
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

      {/* Floating drag overlay — group header chip or item label with checkbox */}
      <DragOverlay>
        {activeGroup ? (
          // Group ghost — colored header chip
          <div
            className={`flex items-center gap-2 px-3 h-10 border shadow-xl cursor-grabbing rounded-t-lg ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32]'
                : 'bg-white border-[#eceff8]'
            }`}
            style={{ width: 320, borderLeft: `3px solid ${activeGroup.color}` }}
          >
            <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: activeGroup.color }} />
            <ChevronRight size={14} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
            <span
              className="text-sm font-medium truncate"
              style={{ color: activeGroup.color }}
            >
              {activeGroup.name}
            </span>
            <span
              className={`text-[10px] px-1.5 rounded-full ml-auto ${
                darkMode ? 'bg-white/10 text-gray-400' : 'bg-black/5 text-gray-500'
              }`}
            >
              {activeGroupTaskCount}
            </span>
          </div>
        ) : activeItem ? (
          // Item / subitem ghost — with checkbox reflecting selection state
          <div
            className={`flex items-center h-10 px-3 border shadow-xl cursor-grabbing group [&_button]:!opacity-100 ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32]'
                : 'bg-white border-[#eceff8]'
            }`}
            style={{ width: 320 }}
          >
            <div className="shrink-0 mr-1">
              {activeIsSelected
                ? <CheckSquare size={15} className="text-blue-500" />
                : <Square size={15} className="text-gray-400 opacity-50" />}
            </div>
            <ItemLabelCell
              task={activeItem}
              isSubitem={activeIsSubitem}
              canEdit={false}
              darkMode={darkMode}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
