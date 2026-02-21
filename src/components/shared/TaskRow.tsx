// Task row — shared row component for the board table.
// Ported from src/components/TaskRow.jsx.

import { useRef, useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUIStore } from '../../stores/uiStore';
import { ItemLabelCell } from './ItemLabelCell';
import { LabelDropdown } from './StatusDropdown';
import { addDaysToKey, formatDateKey, normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { BoardColumns } from '../../types/timeline';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';

interface TaskRowProps {
  task: Item | Subitem;
  projectId: string;
  parentId?: string;
  isSubitem?: boolean;
  isSelected: boolean;
  onToggle: (id: string, projectId: string) => void;
  onAddSubitem?: (projectId: string, taskId: string) => void;
  statuses: StatusLabel[];
  jobTypes: JobTypeLabel[];
  onUpdateName: (value: string) => void;
  onStatusSelect: (statusId: string) => void;
  onTypeSelect: (typeId: string) => void;
  onAddStatusLabel?: (label: string, color: string) => void;
  onAddTypeLabel?: (label: string, color: string) => void;
  onRemoveStatusLabel?: (id: string) => void;
  onRemoveTypeLabel?: (id: string) => void;
  onOpenDatePicker?: () => void;
  onOpenUpdates?: () => void;
  boardColumns: BoardColumns;
  canEdit?: boolean;
}

export function TaskRow({
  task,
  projectId,
  parentId,
  isSubitem = false,
  isSelected,
  onToggle,
  onAddSubitem,
  statuses,
  jobTypes,
  onUpdateName,
  onStatusSelect,
  onTypeSelect,
  onAddStatusLabel,
  onAddTypeLabel,
  onRemoveStatusLabel,
  onRemoveTypeLabel,
  onOpenDatePicker,
  onOpenUpdates,
  boardColumns: col,
  canEdit = true,
}: TaskRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const statusMenuOpen = useUIStore((s) => s.statusMenuOpen);
  const statusMenuType = useUIStore((s) => s.statusMenuType);
  const openStatusMenu = useUIStore((s) => s.openStatusMenu);

  const statusAnchorRef = useRef<HTMLDivElement>(null);
  const typeAnchorRef = useRef<HTMLDivElement>(null);

  // Optimistic label overrides — prevent snap-back from stale Firestore echoes.
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [optimisticType, setOptimisticType] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    };
  }, []);

  const setOptimisticStatusWithTimer = useCallback((id: string) => {
    setOptimisticStatus(id);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setOptimisticStatus(null), 1000);
  }, []);

  const setOptimisticTypeWithTimer = useCallback((id: string) => {
    setOptimisticType(id);
    if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
    typeTimerRef.current = setTimeout(() => setOptimisticType(null), 1000);
  }, []);

  // dnd-kit sortable — used for row reorder in Board view
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: isSubitem ? 'subitem' : 'task',
      projectId,
      groupId: !isSubitem ? (task as Item).groupId : undefined,
      parentTaskId: isSubitem ? parentId : undefined,
    },
    disabled: !canEdit,
  });

  const effectiveStatus = optimisticStatus ?? task.status;
  const effectiveType = optimisticType ?? task.jobTypeId;

  const statusColor = statuses.find((s) => s.id === effectiveStatus)?.color || '#c4c4c4';
  const statusLabel = statuses.find((s) => s.id === effectiveStatus)?.label || 'Status';
  const typeColor = jobTypes.find((t) => t.id === effectiveType)?.color || '#c4c4c4';
  const typeLabel = jobTypes.find((t) => t.id === effectiveType)?.label || 'Type';

  const normalizedStart = normalizeDateKey(task.start);
  const hasDates = Boolean(normalizedStart);
  const safeDuration = Math.max(1, Number(task.duration || 1));
  const endKey = hasDates ? addDaysToKey(normalizedStart, safeDuration - 1) : null;
  const showRange = hasDates && safeDuration > 1;

  const containerClass = isDragging
    ? `flex border-b items-center h-10 relative group ${
        darkMode ? 'bg-blue-500/10 border-blue-500/50' : 'bg-blue-50 border-blue-300'
      } border-dashed opacity-50`
    : `flex border-b transition-colors items-center h-10 relative group ${
        darkMode
          ? 'border-[#2b2c32] hover:bg-[#202336] bg-[#1c213e]'
          : 'border-[#eceff8] hover:bg-[#f0f0f0] bg-white'
      }`;

  const cellBorder = darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]';

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive =
      ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(target.tagName) ||
      !!target.closest('[data-no-dnd]') ||
      target.getAttribute('contenteditable') === 'true';
    if (isInteractive) return;
    onOpenUpdates?.();
  };

  return (
    <div
      ref={setNodeRef}
      className={containerClass}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        touchAction: 'none',
      }}
      onClick={handleRowClick}
      {...attributes}
      {...listeners}
    >
      {/* Checkbox column — data-no-dnd prevents drag from here */}
      <div
        className={`border-r h-full flex items-center justify-center relative min-w-0 ${cellBorder}`}
        style={{ width: col.select }}
        data-no-dnd
      >
        <div
          className={`cursor-pointer transition-all duration-200 ${
            isSelected
              ? 'text-blue-500 opacity-100'
              : 'text-gray-400 opacity-50 group-hover:opacity-100'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (!canEdit) return;
            onToggle(task.id, projectId);
          }}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </div>
      </div>

      {/* Item name column */}
      <div
        className={`border-r h-full flex items-center px-4 relative min-w-0 ${cellBorder}`}
        style={{ width: col.item }}
      >
        <ItemLabelCell
          task={task}
          isSubitem={isSubitem}
          canEdit={canEdit}
          darkMode={darkMode}
          onUpdateName={canEdit ? onUpdateName : undefined}
          onAddSubitem={onAddSubitem ? () => onAddSubitem(projectId, task.id) : undefined}
          onOpenUpdates={onOpenUpdates}
        />
      </div>

      {/* Person column */}
      <div
        className={`border-r h-full flex items-center justify-center min-w-0 ${cellBorder}`}
        style={{ width: col.person }}
      >
        <div className="w-6 h-6 rounded-full bg-gray-400 text-[10px] flex items-center justify-center text-white border-2 border-transparent shadow-sm">
          {task.assignee?.charAt(0)}
        </div>
      </div>

      {/* Status column */}
      <div
        ref={statusAnchorRef}
        className={`border-r h-full flex items-center justify-center px-2 relative min-w-0 ${cellBorder}`}
        style={{ width: col.status }}
        data-no-dnd
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!canEdit) return;
            openStatusMenu(task.id, 'status');
          }}
          className={`w-full h-8 flex items-center justify-center text-xs font-medium text-white rounded-sm overflow-hidden ${
            canEdit ? 'cursor-pointer transition hover:opacity-90' : 'cursor-default opacity-90'
          }`}
          style={{ backgroundColor: statusColor }}
        >
          <span className="truncate w-full text-center px-2">{statusLabel}</span>
        </div>

        {canEdit && statusMenuOpen === task.id && statusMenuType === 'status' && (
          <LabelDropdown
            labels={statuses}
            currentId={effectiveStatus}
            onSelect={(id) => { setOptimisticStatusWithTimer(id); onStatusSelect(id); }}
            darkMode={darkMode}
            onAddLabel={onAddStatusLabel}
            onRemoveLabel={onRemoveStatusLabel}
            title="Status"
            addPlaceholder="New status…"
            anchorRef={statusAnchorRef}
          />
        )}
      </div>

      {/* Type column */}
      <div
        ref={typeAnchorRef}
        className={`border-r h-full flex items-center justify-center px-2 relative min-w-0 ${cellBorder}`}
        style={{ width: col.type }}
        data-no-dnd
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!canEdit) return;
            openStatusMenu(task.id, 'type');
          }}
          className={`w-full h-8 flex items-center justify-center text-xs font-medium text-white rounded-sm overflow-hidden ${
            canEdit ? 'cursor-pointer transition hover:opacity-90' : 'cursor-default opacity-90'
          }`}
          style={{ backgroundColor: typeColor }}
        >
          <span className="truncate w-full text-center px-2">{typeLabel}</span>
        </div>

        {canEdit && statusMenuOpen === task.id && statusMenuType === 'type' && (
          <LabelDropdown
            labels={jobTypes}
            currentId={effectiveType}
            onSelect={(id) => { setOptimisticTypeWithTimer(id); onTypeSelect(id); }}
            darkMode={darkMode}
            onAddLabel={onAddTypeLabel}
            onRemoveLabel={onRemoveTypeLabel}
            title="Type"
            addPlaceholder="New type…"
            anchorRef={typeAnchorRef}
          />
        )}
      </div>

      {/* Date column */}
      <div
        className={`h-full flex items-center justify-center px-4 relative min-w-0 ${
          canEdit ? 'cursor-pointer' : 'cursor-default'
        } ${darkMode ? 'hover:bg-white/5' : ''}`}
        style={{ width: col.date }}
        data-no-dnd
        onClick={(e) => {
          e.stopPropagation();
          if (!canEdit) return;
          onOpenDatePicker?.();
        }}
      >
        {hasDates ? (
          <span
            className={`text-xs truncate text-center ${
              darkMode ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            {formatDateKey(normalizedStart)}
            {showRange ? ` – ${formatDateKey(endKey)}` : ''}
          </span>
        ) : (
          <div
            className={`px-2 py-1 rounded border border-dashed text-[10px] ${
              darkMode
                ? 'border-gray-600 text-gray-500'
                : 'border-gray-300 text-gray-400'
            }`}
          >
            Set Dates
          </div>
        )}
      </div>
    </div>
  );
}
