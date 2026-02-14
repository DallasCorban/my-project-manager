// A single group within the board view: header + task rows.

import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { GroupHeaderRow } from './GroupHeaderRow';
import { TaskRow } from '../shared/TaskRow';
import { EditableText } from '../shared/EditableText';
import type { Board, Group } from '../../types/board';
import type { Item } from '../../types/item';
import type { BoardColumns, ReorderDrag } from '../../types/timeline';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';

interface GroupSectionProps {
  group: Group;
  tasks: Item[];
  project: Board;
  boardColumns: BoardColumns;
  statuses: StatusLabel[];
  jobTypes: JobTypeLabel[];
  onStartResize: (key: keyof BoardColumns, clientX: number) => void;
  onUpdateGroupName: (name: string) => void;
  onUpdateTaskName: (taskId: string, name: string) => void;
  onUpdateSubitemName: (taskId: string, subitemId: string, name: string) => void;
  onStatusSelect: (taskId: string, subitemId: string | null, statusId: string) => void;
  onTypeSelect: (taskId: string, subitemId: string | null, typeId: string) => void;
  onAddTaskToGroup: () => void;
  onAddSubitem: (projectId: string, taskId: string) => void;
  onEditStatusLabels: () => void;
  onEditTypeLabels: () => void;
  onAddStatusLabel: (label: string, color: string) => void;
  onAddTypeLabel: (label: string, color: string) => void;
  onOpenDatePicker: (taskId: string, subitemId: string | null) => void;
  onOpenUpdates: (taskId: string, subitemId: string | null) => void;
  reorderDrag: ReorderDrag | null;
  canEdit: boolean;
  onDragStart?: (e: React.DragEvent, type: string, id: string, pid: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, type: string, id: string, pid: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export function GroupSection({
  group,
  tasks,
  project,
  boardColumns,
  statuses,
  jobTypes,
  onStartResize,
  onUpdateGroupName,
  onUpdateTaskName,
  onUpdateSubitemName,
  onStatusSelect,
  onTypeSelect,
  onAddTaskToGroup,
  onAddSubitem,
  onEditStatusLabels,
  onEditTypeLabels,
  onAddStatusLabel,
  onAddTypeLabel,
  onOpenDatePicker,
  onOpenUpdates,
  reorderDrag,
  canEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: GroupSectionProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const toggleGroupCollapse = useUIStore((s) => s.toggleGroupCollapse);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const toggleSelection = useUIStore((s) => s.toggleSelection);

  const isCollapsed = collapsedGroups.includes(group.id);

  return (
    <div className="mb-6">
      {/* Group header */}
      <div
        className={`flex items-center gap-2 px-4 py-2 cursor-pointer rounded-t-lg ${
          darkMode ? 'hover:bg-[#202336]' : 'hover:bg-gray-50'
        }`}
        onClick={() => toggleGroupCollapse(group.id)}
      >
        <div
          className="w-4 h-4 rounded-sm"
          style={{ backgroundColor: group.color }}
        />
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <EditableText
          value={group.name}
          onChange={canEdit ? (v) => onUpdateGroupName(v) : undefined}
          readOnly={!canEdit}
          className="text-sm font-bold"
        />
        <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          {tasks.length} items
        </span>
      </div>

      {/* Table contents */}
      {!isCollapsed && (
        <div
          className={`rounded-lg border overflow-hidden ${
            darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'
          }`}
          style={{ borderLeftColor: group.color, borderLeftWidth: 3 }}
        >
          {/* Column headers */}
          <GroupHeaderRow boardColumns={boardColumns} onStartResize={onStartResize} />

          {/* Task rows */}
          {tasks.map((task) => (
            <div key={task.id}>
              <TaskRow
                task={task}
                projectId={project.id}
                isSelected={selectedItems.has(task.id)}
                onToggle={toggleSelection}
                onAddSubitem={onAddSubitem}
                statuses={statuses}
                jobTypes={jobTypes}
                onUpdateName={(v) => onUpdateTaskName(task.id, v)}
                onStatusSelect={(sid) => onStatusSelect(task.id, null, sid)}
                onTypeSelect={(tid) => onTypeSelect(task.id, null, tid)}
                onEditStatusLabels={onEditStatusLabels}
                onEditTypeLabels={onEditTypeLabels}
                onAddStatusLabel={onAddStatusLabel}
                onAddTypeLabel={onAddTypeLabel}
                onOpenDatePicker={() => onOpenDatePicker(task.id, null)}
                onOpenUpdates={() => onOpenUpdates(task.id, null)}
                boardColumns={boardColumns}
                reorderDrag={reorderDrag}
                canEdit={canEdit}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              />

              {/* Expanded subitems */}
              {expandedItems.includes(task.id) &&
                task.subitems.map((sub) => (
                  <TaskRow
                    key={sub.id}
                    task={sub}
                    projectId={project.id}
                    parentId={task.id}
                    isSubitem
                    isSelected={selectedItems.has(sub.id)}
                    onToggle={toggleSelection}
                    statuses={statuses}
                    jobTypes={jobTypes}
                    onUpdateName={(v) => onUpdateSubitemName(task.id, sub.id, v)}
                    onStatusSelect={(sid) => onStatusSelect(task.id, sub.id, sid)}
                    onTypeSelect={(tid) => onTypeSelect(task.id, sub.id, tid)}
                    onEditStatusLabels={onEditStatusLabels}
                    onEditTypeLabels={onEditTypeLabels}
                    onAddStatusLabel={onAddStatusLabel}
                    onAddTypeLabel={onAddTypeLabel}
                    onOpenDatePicker={() => onOpenDatePicker(task.id, sub.id)}
                    onOpenUpdates={() => onOpenUpdates(task.id, sub.id)}
                    boardColumns={boardColumns}
                    reorderDrag={reorderDrag}
                    canEdit={canEdit}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                  />
                ))}
            </div>
          ))}

          {/* Add item row */}
          {canEdit && (
            <div
              className={`flex items-center h-10 px-4 cursor-pointer transition-colors ${
                darkMode
                  ? 'hover:bg-[#202336] text-gray-500'
                  : 'hover:bg-gray-50 text-gray-400'
              }`}
              onClick={onAddTaskToGroup}
            >
              <Plus size={14} className="mr-2" />
              <span className="text-xs">Add Item</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
