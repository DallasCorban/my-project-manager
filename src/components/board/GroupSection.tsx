// A single group within the board view: header + task rows.

import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { useUIStore } from '../../stores/uiStore';
import { GroupHeaderRow } from './GroupHeaderRow';
import { TaskRow } from '../shared/TaskRow';
import { EditableText } from '../shared/EditableText';
import type { Board, Group } from '../../types/board';
import type { Item } from '../../types/item';
import type { BoardColumns } from '../../types/timeline';
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
  onAddTaskToGroup: (name?: string) => void;
  onAddSubitem: (projectId: string, taskId: string) => void;
  onAddStatusLabel: (label: string, color: string) => void;
  onAddTypeLabel: (label: string, color: string) => void;
  onRemoveStatusLabel?: (id: string) => void;
  onRemoveTypeLabel?: (id: string) => void;
  onOpenDatePicker: (taskId: string, subitemId: string | null) => void;
  onOpenUpdates: (taskId: string, subitemId: string | null) => void;
  canEdit: boolean;
  /** Listeners from useSortable — spread on the header as the group drag handle. */
  dragHandleListeners?: SyntheticListenerMap;
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
  onAddStatusLabel,
  onAddTypeLabel,
  onRemoveStatusLabel,
  onRemoveTypeLabel,
  onOpenDatePicker,
  onOpenUpdates,
  canEdit,
  dragHandleListeners,
}: GroupSectionProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const toggleGroupCollapse = useUIStore((s) => s.toggleGroupCollapse);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const toggleSelection = useUIStore((s) => s.toggleSelection);

  // Inline add item state
  const [isAdding, setIsAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  const isCollapsed = collapsedGroups.includes(group.id);

  const handleAddSubmit = () => {
    const name = addText.trim();
    if (name) {
      onAddTaskToGroup(name);
      setAddText('');
      // Keep input focused for rapid entry
      setTimeout(() => addInputRef.current?.focus(), 0);
    }
  };

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddSubmit();
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setAddText('');
    }
  };

  return (
    <div className="mb-6">
      {/* Group header — drag handle for group reorder; collapse toggle on inner area */}
      <div
        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg ${
          dragHandleListeners ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        } ${darkMode ? 'hover:bg-[#202336]' : 'hover:bg-gray-50'}`}
        {...dragHandleListeners}
      >
        <div
          className="w-4 h-4 rounded-sm shrink-0"
          style={{ backgroundColor: group.color }}
        />
        {/* data-no-dnd: prevents SmartPointerSensor from starting a group drag when
            the user clicks the chevron/name to collapse/edit */}
        <div
          className="flex items-center gap-2 flex-1 cursor-pointer"
          data-no-dnd
          onClick={() => toggleGroupCollapse(group.id)}
        >
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
      </div>

      {/* Table contents */}
      {!isCollapsed && (
        <div
          className={`rounded-lg border ${
            darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'
          }`}
          style={{ borderLeftColor: group.color, borderLeftWidth: 3 }}
        >
          {/* Column headers */}
          <GroupHeaderRow boardColumns={boardColumns} onStartResize={onStartResize} />

          {/* Task rows — wrapped in SortableContext for @dnd-kit row reorder */}
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
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
                  onAddStatusLabel={onAddStatusLabel}
                  onAddTypeLabel={onAddTypeLabel}
                  onRemoveStatusLabel={onRemoveStatusLabel}
                  onRemoveTypeLabel={onRemoveTypeLabel}
                  onOpenDatePicker={() => onOpenDatePicker(task.id, null)}
                  onOpenUpdates={() => onOpenUpdates(task.id, null)}
                  boardColumns={boardColumns}
                  canEdit={canEdit}
                />

                {/* Expanded subitems — nested SortableContext */}
                {expandedItems.includes(task.id) && (
                  <SortableContext
                    items={task.subitems.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {task.subitems.map((sub) => (
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
                        onAddStatusLabel={onAddStatusLabel}
                        onAddTypeLabel={onAddTypeLabel}
                        onRemoveStatusLabel={onRemoveStatusLabel}
                        onRemoveTypeLabel={onRemoveTypeLabel}
                        onOpenDatePicker={() => onOpenDatePicker(task.id, sub.id)}
                        onOpenUpdates={() => onOpenUpdates(task.id, sub.id)}
                        boardColumns={boardColumns}
                        canEdit={canEdit}
                      />
                    ))}
                  </SortableContext>
                )}
              </div>
            ))}
          </SortableContext>

          {/* Add item row — inline input */}
          {canEdit && (
            <div
              className={`flex items-center h-10 px-4 transition-colors ${
                darkMode
                  ? 'hover:bg-[#202336] text-gray-500'
                  : 'hover:bg-gray-50 text-gray-400'
              }`}
            >
              {isAdding ? (
                <div className="flex items-center gap-2 w-full">
                  <Plus size={14} className="shrink-0" />
                  <input
                    ref={addInputRef}
                    autoFocus
                    value={addText}
                    onChange={(e) => setAddText(e.target.value)}
                    onKeyDown={handleAddKeyDown}
                    onBlur={() => {
                      if (!addText.trim()) {
                        setIsAdding(false);
                        setAddText('');
                      }
                    }}
                    placeholder="Item name..."
                    className={`flex-1 h-7 px-2 text-xs rounded outline-none border ${
                      darkMode
                        ? 'bg-[#181b34] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                        : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400'
                    }`}
                  />
                </div>
              ) : (
                <div
                  className="flex items-center gap-2 cursor-pointer"
                  onClick={() => setIsAdding(true)}
                >
                  <Plus size={14} />
                  <span className="text-xs">Add Item</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
