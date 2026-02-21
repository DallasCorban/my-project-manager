// Board view — the main table view container.
// Renders group sections for the active project with drag & drop reordering.

import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useBoardColumns } from '../../hooks/useBoardColumns';
import { useSortableSensors } from '../../hooks/useSmartSensors';
import { GroupSection } from './GroupSection';
import type { Board } from '../../types/board';
import type { Item, Subitem } from '../../types/item';

interface BoardViewProps {
  project: Board;
}

export function BoardView({ project }: BoardViewProps) {
  const darkMode = useUIStore((s) => s.darkMode);
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

  // --- dnd-kit row reorder ---
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Find the active item (task or subitem) for DragOverlay
  const activeItem: Item | Subitem | null = activeId
    ? (project.tasks.find((t) => t.id === activeId) ??
       project.tasks.flatMap((t) => t.subitems).find((s) => s.id === activeId) ??
       null)
    : null;

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as { type: string; groupId?: string; parentTaskId?: string } | undefined;
      const overData = over.data.current as { type: string; groupId?: string } | undefined;
      if (!activeData || !overData) return;

      if (activeData.type === 'task' && overData.type === 'task') {
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
      } else if (activeData.type === 'subitem' && overData.type === 'subitem') {
        const parentTask = project.tasks.find((t) =>
          t.subitems.some((s) => s.id === active.id),
        );
        if (!parentTask) return;
        const fromIndex = parentTask.subitems.findIndex((s) => s.id === active.id);
        const toIndex = parentTask.subitems.findIndex((s) => s.id === over.id);
        if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
          reorderSubitems(project.id, parentTask.id, fromIndex, toIndex);
        }
      }
    },
    [project, reorderTasks, moveTaskToGroup, reorderSubitems],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-auto p-6">
        {project.groups.map((group) => {
          const groupTasks = project.tasks.filter((t) => t.groupId === group.id);

          return (
            <GroupSection
              key={group.id}
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
            />
          );
        })}

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

      {/* Floating drag overlay — shows task name while dragging */}
      <DragOverlay>
        {activeItem ? (
          <div
            className={`flex items-center h-10 px-4 rounded border shadow-xl text-sm font-medium cursor-grabbing opacity-95 ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200'
                : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            {activeItem.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
