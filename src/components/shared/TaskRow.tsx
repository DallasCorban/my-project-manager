// Task row — shared row component for the board table.
// Ported from src/components/TaskRow.jsx.

import { useRef, useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { useUIStore } from '../../stores/uiStore';
import { ItemLabelCell } from './ItemLabelCell';
import { LabelDropdown } from './StatusDropdown';
import { AvatarStack } from './AvatarStack';
import { PeopleDropdown } from './PeopleDropdown';
import { addDaysToKey, formatDateKey, normalizeDateKey } from '../../utils/date';
import type { Item, Subitem } from '../../types/item';
import type { BoardColumns, DraggableColumnKey } from '../../types/timeline';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';
import { DEFAULT_COLUMN_ORDER } from '../../config/constants';

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
  onRenameStatusLabel?: (id: string, newLabel: string) => void;
  onRenameTypeLabel?: (id: string, newLabel: string) => void;
  onReorderStatuses?: (labels: StatusLabel[]) => void;
  onReorderTypes?: (labels: JobTypeLabel[]) => void;
  onUpdateStatusColor?: (id: string, color: string) => void;
  onUpdateTypeColor?: (id: string, color: string) => void;
  onToggleTypeContainer?: (id: string) => void;
  onToggleAssignee?: (uid: string) => void;
  onOpenDatePicker?: () => void;
  onOpenUpdates?: () => void;
  boardColumns: BoardColumns;
  columnOrder?: DraggableColumnKey[];
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
  onRenameStatusLabel,
  onRenameTypeLabel,
  onReorderStatuses,
  onReorderTypes,
  onUpdateStatusColor,
  onUpdateTypeColor,
  onToggleTypeContainer,
  onToggleAssignee,
  onOpenDatePicker,
  onOpenUpdates,
  boardColumns: col,
  columnOrder = DEFAULT_COLUMN_ORDER,
  canEdit = true,
}: TaskRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const statusMenuOpen = useUIStore((s) => s.statusMenuOpen);
  const statusMenuType = useUIStore((s) => s.statusMenuType);
  const openStatusMenu = useUIStore((s) => s.openStatusMenu);
  const closeStatusMenu = useUIStore((s) => s.closeStatusMenu);
  const peopleMenuOpen = useUIStore((s) => s.peopleMenuOpen);
  const openPeopleMenu = useUIStore((s) => s.openPeopleMenu);
  const closePeopleMenu = useUIStore((s) => s.closePeopleMenu);

  const statusAnchorRef = useRef<HTMLDivElement>(null);
  const typeAnchorRef = useRef<HTMLDivElement>(null);
  const peopleAnchorRef = useRef<HTMLDivElement>(null);

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
    transition: sortTransition,
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

  // Non-active rows keep a baseline transform transition at all times. dnd-kit
  // can occasionally emit a temporary `transform 0ms ...` transition during the
  // first layout-shift frame; if we apply that literally, displaced rows "snap"
  // on the first swap. We treat that as a disabled value and keep the baseline.
  const FALLBACK_SORT_TRANSITION = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
  const hasUsableTransformTransition =
    typeof sortTransition === 'string' &&
    sortTransition.includes('transform') &&
    !/transform\s+0(?:ms|s)\b/.test(sortTransition);
  const transition = isDragging
    ? undefined
    : (hasUsableTransformTransition ? sortTransition : FALLBACK_SORT_TRANSITION);

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

  // Items are lighter, subitems are darker — consistent across both views.
  const rowBg = darkMode
    ? isSubitem ? 'bg-[#191c36]' : 'bg-[#1c213e]'
    : isSubitem ? 'bg-[#f4f5fc]' : 'bg-white';

  // When dragging: the original row becomes an invisible placeholder that reserves
  // space in the layout. The DragOverlay renders the floating ghost instead.
  const containerClass = isDragging
    ? `flex border-b items-center h-9 relative group opacity-0 ${
        darkMode ? 'border-[#323652]' : 'border-[#eceff8]'
      } ${rowBg}`
    : `flex border-b items-center h-9 relative group transition-colors ${
        darkMode
          ? 'border-[#323652] hover:bg-[#202336]'
          : 'border-[#eceff8] hover:bg-[#f0f0f0]'
      } ${rowBg}`;

  const cellBorder = darkMode ? 'border-[#323652]' : 'border-[#eceff8]';

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
      data-task-row-id={task.id}
      data-task-group-id={!isSubitem ? (task as Item).groupId : undefined}
      className={containerClass}
      style={{
        // Always keep a concrete translate3d on every row — even when idle.
        //
        // Why: dnd-kit's drag activation and first collision detection fire in the
        // same pointer-event handler, so React batches `isSorting=true` and the
        // first sort `transform` into a single render.  If the previous painted
        // frame had `transform: none`, the browser has no "from" value to
        // transition from and the item snaps instead of gliding.
        //
        // By always painting translate3d(0,0,0), every frame already has a concrete
        // transform + transition.  When the first sort fires, the browser smoothly
        // interpolates from (0,0,0) to the displaced position.
        //
        // translate3d (vs translate) also promotes each row to its own GPU
        // compositing layer, avoiding the old willChange toggle that could itself
        // disrupt layer creation mid-animation.
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : 'translate3d(0, 0, 0)',
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

      {/* Dynamic columns — rendered in columnOrder */}
      {columnOrder.map((key, colIdx) => {
        const borderClass = 'border-r';

        if (key === 'person') {
          return (
            <div
              key="person"
              ref={peopleAnchorRef}
              className={`${borderClass} h-full flex items-center justify-center min-w-0 ${cellBorder}`}
              style={{ width: col.person }}
              data-no-dnd
            >
              <div
                onMouseDown={(e) => {
                  if (peopleMenuOpen === task.id) e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canEdit) return;
                  if (peopleMenuOpen === task.id) closePeopleMenu();
                  else openPeopleMenu(task.id);
                }}
                className={`h-full flex items-center justify-center ${
                  canEdit ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                <AvatarStack
                  assignees={task.assignees || []}
                  darkMode={darkMode}
                />
              </div>

              {canEdit && peopleMenuOpen === task.id && onToggleAssignee && (
                <PeopleDropdown
                  assignees={task.assignees || []}
                  projectId={projectId}
                  onToggleAssignee={onToggleAssignee}
                  darkMode={darkMode}
                  anchorRef={peopleAnchorRef}
                />
              )}
            </div>
          );
        }

        if (key === 'status') {
          return (
            <div
              key="status"
              ref={statusAnchorRef}
              className={`${borderClass} h-full flex items-center justify-center relative min-w-0 ${cellBorder}`}
              style={{ width: col.status }}
              data-no-dnd
            >
              <div
                onMouseDown={(e) => {
                  if (statusMenuOpen === task.id && statusMenuType === 'status') e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canEdit) return;
                  if (statusMenuOpen === task.id && statusMenuType === 'status') closeStatusMenu();
                  else openStatusMenu(task.id, 'status');
                }}
                className={`w-full h-full flex items-center justify-center text-xs font-medium text-white overflow-hidden ${
                  canEdit ? 'cursor-pointer transition hover:brightness-110' : 'cursor-default'
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
                  onRenameLabel={onRenameStatusLabel}
                  onReorderLabels={onReorderStatuses}
                  onUpdateLabelColor={onUpdateStatusColor}
                  title="Status"
                  addPlaceholder="New status…"
                  anchorRef={statusAnchorRef}
                />
              )}
            </div>
          );
        }

        if (key === 'type') {
          return (
            <div
              key="type"
              ref={typeAnchorRef}
              className={`${borderClass} h-full flex items-center justify-center relative min-w-0 ${cellBorder}`}
              style={{ width: col.type }}
              data-no-dnd
            >
              <div
                onMouseDown={(e) => {
                  if (statusMenuOpen === task.id && statusMenuType === 'type') e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canEdit) return;
                  if (statusMenuOpen === task.id && statusMenuType === 'type') closeStatusMenu();
                  else openStatusMenu(task.id, 'type');
                }}
                className={`w-full h-full flex items-center justify-center text-xs font-medium text-white overflow-hidden ${
                  canEdit ? 'cursor-pointer transition hover:brightness-110' : 'cursor-default'
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
                  onRenameLabel={onRenameTypeLabel}
                  onReorderLabels={onReorderTypes}
                  onUpdateLabelColor={onUpdateTypeColor}
                  onToggleLabelContainer={onToggleTypeContainer}
                  title="Type"
                  addPlaceholder="New type…"
                  anchorRef={typeAnchorRef}
                />
              )}
            </div>
          );
        }

        if (key === 'date') {
          return (
            <div
              key="date"
              className={`${borderClass} h-full flex items-center justify-center px-4 relative min-w-0 ${cellBorder} ${
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
          );
        }

        return null;
      })}
    </div>
  );
}
