// Board view — the main table view container.
// Renders group sections for the active project with drag & drop reordering.

import { useState, useCallback, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceData } from '../../stores/workspaceStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useBoardColumns } from '../../hooks/useBoardColumns';
import { GroupSection } from './GroupSection';
import type { Board } from '../../types/board';
import type { ReorderDrag } from '../../types/timeline';

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

  const { statuses, setStatuses, jobTypes, setJobTypes, activeEntityId } = useWorkspaceData();

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

  // --- Drag & drop state ---
  const [reorderDrag, setReorderDrag] = useState<ReorderDrag | null>(null);
  const dragDataRef = useRef<{
    type: 'task' | 'subitem';
    id: string;
    groupId: string;
    parentTaskId?: string;
  } | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, type: string, id: string, _pid: string) => {
      const itemType = type as 'task' | 'subitem';

      // Find the task/subitem's group
      let groupId = '';
      let parentTaskId: string | undefined;
      if (itemType === 'task') {
        const task = project.tasks.find((t) => t.id === id);
        groupId = task?.groupId || '';
      } else {
        // subitem — find parent task
        for (const t of project.tasks) {
          if (t.subitems.some((s) => s.id === id)) {
            parentTaskId = t.id;
            groupId = t.groupId;
            break;
          }
        }
      }

      dragDataRef.current = { type: itemType, id, groupId, parentTaskId };

      // Set drag image
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);

      setReorderDrag({
        active: true,
        type: itemType,
        dragId: id,
        parentId: parentTaskId || null,
        dropTargetId: null,
        dropTargetType: null,
        dropTargetProjectId: project.id,
        sourceProjectId: project.id,
        dropPosition: 'after',
        originalExpanded: false,
      });
    },
    [project],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Find the closest task row
    const target = e.target as HTMLElement;
    const row = target.closest('[draggable="true"]') as HTMLElement | null;
    if (!row) return;

    // Get the task/subitem id from the row's data
    const rect = row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';

    // Extract ID from the row — we'll use the onDrop callback's parameters instead
    setReorderDrag((prev) => {
      if (!prev) return prev;
      return { ...prev, dropPosition: position };
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropType: string, dropId: string, _dropPid: string) => {
      e.preventDefault();
      const dragData = dragDataRef.current;
      if (!dragData || !reorderDrag) return;

      const { type, id: dragId, groupId: sourceGroupId, parentTaskId } = dragData;

      if (type === 'task' && dropType === 'task') {
        // Find drop target's group
        const dropTask = project.tasks.find((t) => t.id === dropId);
        if (!dropTask) return;
        const targetGroupId = dropTask.groupId;

        if (sourceGroupId === targetGroupId) {
          // Same group reorder
          const groupTasks = project.tasks.filter((t) => t.groupId === sourceGroupId);
          const fromIndex = groupTasks.findIndex((t) => t.id === dragId);
          let toIndex = groupTasks.findIndex((t) => t.id === dropId);
          if (reorderDrag.dropPosition === 'after') toIndex += 1;
          if (fromIndex < toIndex) toIndex -= 1;
          if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            reorderTasks(project.id, sourceGroupId, fromIndex, toIndex);
          }
        } else {
          // Cross-group move
          const targetGroupTasks = project.tasks.filter((t) => t.groupId === targetGroupId);
          let toIndex = targetGroupTasks.findIndex((t) => t.id === dropId);
          if (reorderDrag.dropPosition === 'after') toIndex += 1;
          moveTaskToGroup(project.id, dragId, sourceGroupId, targetGroupId, toIndex);
        }
      } else if (type === 'subitem' && dropType === 'subitem' && parentTaskId) {
        // Subitem reorder within same parent
        const parentTask = project.tasks.find((t) => t.id === parentTaskId);
        if (!parentTask) return;
        const fromIndex = parentTask.subitems.findIndex((s) => s.id === dragId);
        let toIndex = parentTask.subitems.findIndex((s) => s.id === dropId);
        if (reorderDrag.dropPosition === 'after') toIndex += 1;
        if (fromIndex < toIndex) toIndex -= 1;
        if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
          reorderSubitems(project.id, parentTaskId, fromIndex, toIndex);
        }
      }

      // Reset
      dragDataRef.current = null;
      setReorderDrag(null);
    },
    [project, reorderDrag, reorderTasks, moveTaskToGroup, reorderSubitems],
  );

  const handleDragEnd = useCallback(() => {
    dragDataRef.current = null;
    setReorderDrag(null);
  }, []);

  return (
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
            reorderDrag={reorderDrag}
            canEdit={true}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
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
  );
}
