// Board view — the main table view container.
// Renders group sections for the active project.

import { Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectData } from '../../stores/projectStore';
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
  } = useProjectData();

  const { statuses, setStatuses, jobTypes, setJobTypes, activeEntityId } = useWorkspaceData();

  const boardColumns = useTimelineStore((s) => s.getBoardColumns(activeEntityId));
  const setBoardColumns = useTimelineStore((s) => s.setBoardColumns);

  const { handleStartResize } = useBoardColumns(boardColumns, (cols) =>
    setBoardColumns(activeEntityId, cols),
  );

  // Status/type label management
  // (For now, inline add. Label editor modal will be wired in AppShell.)
  const handleAddStatusLabel = (label: string, color: string) => {
    const id = label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    setStatuses((prev) => [...prev, { id, label, color }]);
  };

  const handleAddTypeLabel = (label: string, color: string) => {
    const id = label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
    setJobTypes((prev) => [...prev, { id, label, color }]);
  };

  // Placeholder reorder drag state (full implementation in a later iteration)
  const reorderDrag: ReorderDrag | null = null;

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
            onAddTaskToGroup={() => addTaskToGroup(project.id, group.id)}
            onAddSubitem={addSubitem}
            onEditStatusLabels={() => {
              /* Will open label editor modal — wired in AppShell */
            }}
            onEditTypeLabels={() => {
              /* Will open label editor modal — wired in AppShell */
            }}
            onAddStatusLabel={handleAddStatusLabel}
            onAddTypeLabel={handleAddTypeLabel}
            onOpenDatePicker={(taskId, subId) =>
              openDatePicker({ taskId, subitemId: subId, projectId: project.id })
            }
            onOpenUpdates={(taskId, subId) =>
              openUpdatesPanel({ taskId, subitemId: subId, projectId: project.id })
            }
            reorderDrag={reorderDrag}
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
  );
}
