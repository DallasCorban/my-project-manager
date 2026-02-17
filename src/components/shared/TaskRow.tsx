// Task row — shared row component for the board table.
// Ported from src/components/TaskRow.jsx.

import { useRef, useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, CornerDownRight, ChevronRight, Plus, MessageSquare } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { EditableText } from './EditableText';
import { LabelDropdown } from './StatusDropdown';
import { addDaysToKey, formatDateKey, normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { BoardColumns, ReorderDrag } from '../../types/timeline';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';

interface TaskRowProps {
  task: Item | Subitem;
  projectId: string;
  parentId?: string;
  isSubitem?: boolean;
  isDragging?: boolean;
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
  reorderDrag?: ReorderDrag | null;
  canEdit?: boolean;
  onDragStart?: (e: React.DragEvent, type: string, id: string, pid: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, type: string, id: string, pid: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export function TaskRow({
  task,
  projectId,
  parentId: _parentId,
  isSubitem = false,
  isDragging = false,
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
  reorderDrag,
  canEdit = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TaskRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const statusMenuOpen = useUIStore((s) => s.statusMenuOpen);
  const statusMenuType = useUIStore((s) => s.statusMenuType);
  const openStatusMenu = useUIStore((s) => s.openStatusMenu);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const toggleItemExpand = useUIStore((s) => s.toggleItemExpand);

  const dragBlockRef = useRef(false);
  const statusAnchorRef = useRef<HTMLDivElement>(null);
  const typeAnchorRef = useRef<HTMLDivElement>(null);

  const hasSubitems = 'subitems' in task && task.subitems && task.subitems.length > 0;

  // Optimistic label overrides — prevent snap-back from stale Firestore echoes.
  // The override is held for a fixed window (longer than debounce + network RTT)
  // rather than cleared on store convergence, because the store briefly converges
  // then reverts when the Firestore echo arrives.
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [optimisticType, setOptimisticType] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
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

  const isRowDragging = Boolean(isDragging);
  const containerClass = isRowDragging
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
    if (dragBlockRef.current) return;
    const target = e.target as HTMLElement;
    const isInteractive =
      ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(target.tagName) ||
      target.closest('.no-drag') ||
      target.getAttribute('contenteditable') === 'true';
    if (isInteractive) return;
    onOpenUpdates?.();
  };

  return (
    <div
      className={containerClass}
      draggable={canEdit}
      onClick={handleRowClick}
      onMouseDownCapture={(e) => {
        const target = e.target as HTMLElement;
        const isInteractive =
          ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(target.tagName) ||
          target.closest('.no-drag') ||
          target.getAttribute('contenteditable') === 'true';
        dragBlockRef.current = Boolean(isInteractive);
      }}
      onMouseUp={() => { dragBlockRef.current = false; }}
      onMouseLeave={() => { dragBlockRef.current = false; }}
      onDragStart={(e) => {
        if (!canEdit || dragBlockRef.current) {
          e.preventDefault();
          return;
        }
        onDragStart?.(e, isSubitem ? 'subitem' : 'task', task.id, projectId);
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        onDrop?.(e, isSubitem ? 'subitem' : 'task', task.id, projectId);
      }}
      onDragEnd={onDragEnd}
    >
      {/* Checkbox column */}
      <div
        className={`border-r h-full flex items-center justify-center relative no-drag min-w-0 ${cellBorder}`}
        style={{ width: col.select }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
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
        <div className={`flex items-center gap-2 w-full ${isSubitem ? 'pl-10' : ''}`}>
          {isSubitem && <CornerDownRight size={12} className="text-gray-400 shrink-0" />}

          {!isSubitem && (
            <div
              onClick={hasSubitems ? () => toggleItemExpand(task.id) : undefined}
              className={`mr-2 transition-colors ${
                hasSubitems
                  ? 'cursor-pointer text-gray-400 hover:text-blue-500'
                  : 'cursor-default text-gray-300 opacity-30'
              } ${expandedItems.includes(task.id) ? 'rotate-90' : ''}`}
            >
              <ChevronRight size={14} />
            </div>
          )}

          <EditableText
            value={task.name}
            onChange={canEdit ? onUpdateName : undefined}
            readOnly={!canEdit}
            className={`text-sm ${darkMode ? 'text-gray-200' : 'text-[#323338]'}`}
          />

          {!isSubitem && (
            <div className="flex items-center gap-1 ml-auto no-drag">
              {hasSubitems && (
                <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 rounded-full">
                  {(task as Item).subitems.length}
                </span>
              )}
              {/* Updates open button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenUpdates?.();
                }}
                className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${
                  darkMode
                    ? 'hover:bg-white/10 text-gray-400 hover:text-blue-400'
                    : 'hover:bg-gray-200 text-gray-400 hover:text-blue-600'
                }`}
                title="Open updates"
              >
                <MessageSquare size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canEdit) return;
                  onAddSubitem?.(projectId, task.id);
                }}
                className={`p-1 rounded transition-colors ${
                  canEdit
                    ? 'hover:bg-gray-200 text-gray-400 hover:text-blue-600'
                    : 'text-gray-500/60 cursor-not-allowed'
                }`}
                disabled={!canEdit}
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
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

      {/* Reorder drop indicator */}
      {reorderDrag?.active && reorderDrag.dropTargetId === task.id && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 z-50 pointer-events-none"
          style={{
            top: reorderDrag.dropPosition === 'before' ? '-1px' : 'auto',
            bottom: reorderDrag.dropPosition === 'after' ? '-1px' : 'auto',
          }}
        />
      )}
    </div>
  );
}
