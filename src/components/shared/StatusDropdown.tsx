// Label dropdown — unified Status/Type picker with portal rendering.
// Two modes: selection (colored pills) and edit (rename, reorder, color, delete).
// Animated transition between modes. Centered on anchor with triangle pointer.
// Renders via React Portal to avoid overflow clipping.

import { useState, useRef, useCallback, useEffect, useLayoutEffect, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, MoreHorizontal, Trash2, GripVertical, Box } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useClickOutside } from '../../hooks/useClickOutside';
import { MONDAY_PALETTE } from '../../config/constants';
import type { StatusLabel } from '../../config/constants';

const TRANSITION = 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)';

// ─── Color preset picker popover ─────────────────────────────────────────────

function ColorPresetPicker({
  currentColor,
  onSelect,
  darkMode,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
  darkMode: boolean;
}) {
  return (
    <div
      className={`p-2 rounded-lg shadow-xl border ${
        darkMode ? 'bg-[#1e2243] border-[#323652]' : 'bg-white border-gray-200'
      }`}
      style={{ width: 168 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-7 gap-1">
        {MONDAY_PALETTE.map((color) => (
          <button
            key={color}
            onClick={() => onSelect(color)}
            className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
              currentColor === color ? 'ring-2 ring-offset-1 ring-blue-500' : ''
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Three-dot menu for edit mode ────────────────────────────────────────────

function LabelMenu({
  onDelete,
  darkMode,
  onClose,
  isContainer,
  onToggleContainer,
}: {
  onDelete: () => void;
  darkMode: boolean;
  onClose: () => void;
  isContainer?: boolean;
  onToggleContainer?: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
      />
      <div
        className={`absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-50 py-1 ${
          darkMode ? 'bg-[#1e2243] border-[#323652]' : 'bg-white border-gray-200'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {onToggleContainer && (
          <button
            onClick={() => { onToggleContainer(); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${
              darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
            } transition-colors`}
          >
            <Box size={13} />
            {isContainer ? 'Remove container' : 'Mark as container'}
          </button>
        )}
        <button
          onClick={() => { onDelete(); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs ${
            darkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'
          } transition-colors`}
        >
          <Trash2 size={13} />
          Delete label
        </button>
      </div>
    </>
  );
}

// ─── Unified label row (works in both modes, animates between them) ──────────

function LabelRow({
  label,
  editMode,
  isCurrent,
  darkMode,
  onSelect,
  onRename,
  onColorChange,
  onDelete,
  onToggleContainer,
  sortableProps,
}: {
  label: StatusLabel;
  editMode: boolean;
  isCurrent: boolean;
  darkMode: boolean;
  onSelect: () => void;
  onRename?: (newName: string) => void;
  onColorChange?: (newColor: string) => void;
  onDelete?: () => void;
  onToggleContainer?: () => void;
  sortableProps?: ReturnType<typeof useSortable>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [editName, setEditName] = useState(label.label);

  // Sync editName when label changes externally or when entering edit mode
  useEffect(() => { setEditName(label.label); }, [label.label]);

  // Close sub-menus when leaving edit mode
  useEffect(() => {
    if (!editMode) { setMenuOpen(false); setColorPickerOpen(false); }
  }, [editMode]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== label.label) onRename?.(trimmed);
    else setEditName(label.label);
  };

  const dragStyle = sortableProps ? {
    transform: CSS.Transform.toString(sortableProps.transform),
    transition: sortableProps.transition,
    opacity: sortableProps.isDragging ? 0.5 : 1,
    zIndex: sortableProps.isDragging ? 50 : undefined,
  } : {};

  return (
    <div
      ref={sortableProps?.setNodeRef}
      style={dragStyle}
      className={`group/row relative flex items-center ${editMode ? 'py-0.5' : ''}`}
    >
      {/* Drag handle — slides in during edit mode */}
      <div
        {...(editMode ? sortableProps?.attributes : {})}
        {...(editMode ? sortableProps?.listeners : {})}
        style={{
          width: editMode ? 18 : 0,
          overflow: 'hidden',
          transition: TRANSITION,
          flexShrink: 0,
          cursor: editMode ? 'grab' : 'default',
        }}
        className={`opacity-0 ${editMode ? 'group-hover/row:!opacity-60' : ''} text-gray-400`}
      >
        <GripVertical size={14} />
      </div>

      {/* Main clickable area */}
      <div
        onClick={(e) => {
          if (!editMode) { e.stopPropagation(); onSelect(); }
        }}
        className="flex-1 min-w-0 flex items-center relative"
        style={{
          height: 32,
          cursor: editMode ? 'default' : 'pointer',
          transition: TRANSITION,
        }}
      >
        {/* Color background — full pill in select, small dot in edit */}
        <div
          style={{
            position: editMode ? 'relative' : 'absolute',
            inset: editMode ? undefined : 0,
            width: editMode ? 20 : '100%',
            height: editMode ? 20 : '100%',
            backgroundColor: label.color,
            borderRadius: editMode ? 5 : 4,
            flexShrink: 0,
            transition: TRANSITION,
          }}
          onClick={(e) => {
            if (editMode) { e.stopPropagation(); setColorPickerOpen(!colorPickerOpen); }
          }}
          className={editMode ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 ring-1 ring-white/20' : ''}
        >
          {/* Label text inside the pill — fades out in edit mode */}
          <span
            className="text-xs font-semibold text-white truncate px-3 flex items-center justify-center h-full w-full"
            style={{
              opacity: editMode ? 0 : 1,
              transition: 'opacity 150ms ease',
              pointerEvents: 'none',
            }}
          >
            {label.label}
          </span>
        </div>

        {/* Color picker popover */}
        {editMode && colorPickerOpen && (
          <div className="absolute left-0 top-full mt-1 z-50">
            <ColorPresetPicker
              currentColor={label.color}
              onSelect={(c) => { onColorChange?.(c); setColorPickerOpen(false); }}
              darkMode={darkMode}
            />
          </div>
        )}

        {/* Editable name — fades in during edit mode */}
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setEditName(label.label); e.currentTarget.blur(); }
          }}
          readOnly={!editMode}
          tabIndex={editMode ? 0 : -1}
          className={`min-w-0 h-7 px-1.5 rounded text-xs font-medium outline-none border bg-transparent ${
            darkMode
              ? 'border-transparent focus:border-[#323652] text-gray-200'
              : 'border-transparent focus:border-gray-300 text-gray-700'
          }`}
          style={{
            opacity: editMode ? 1 : 0,
            width: editMode ? '100%' : 0,
            padding: editMode ? undefined : 0,
            position: editMode ? 'relative' : 'absolute',
            pointerEvents: editMode ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
            flex: editMode ? 1 : undefined,
          }}
          data-no-dnd
        />

        {/* Current indicator ring for selection mode */}
        {!editMode && isCurrent && (
          <div
            className="absolute inset-0 rounded ring-2 ring-offset-1 ring-blue-500 pointer-events-none"
            style={{ ringOffsetColor: darkMode ? '#161a33' : '#fff' } as React.CSSProperties}
          />
        )}
      </div>

      {/* Three-dot menu — slides in during edit mode */}
      <div
        className={`relative opacity-0 ${editMode ? 'group-hover/row:!opacity-100' : ''} ${menuOpen ? '!opacity-100' : ''}`}
        style={{
          width: editMode ? 24 : 0,
          overflow: editMode ? 'visible' : 'hidden',
          transition: TRANSITION,
          flexShrink: 0,
        }}
      >
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className={`p-1 rounded transition-colors ${
            darkMode ? 'text-gray-400 hover:bg-[#323652]' : 'text-gray-400 hover:bg-gray-200'
          }`}
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <LabelMenu
            onDelete={() => { onDelete?.(); setMenuOpen(false); }}
            darkMode={darkMode}
            onClose={() => setMenuOpen(false)}
            isContainer={'isContainer' in label ? (label as { isContainer?: boolean }).isContainer : undefined}
            onToggleContainer={onToggleContainer}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sortable wrapper for edit mode ──────────────────────────────────────────

function SortableLabelRow(props: Omit<Parameters<typeof LabelRow>[0], 'sortableProps'>) {
  const sortable = useSortable({ id: props.label.id });
  return <LabelRow {...props} sortableProps={sortable} />;
}

// ─── Main LabelDropdown ──────────────────────────────────────────────────────

interface LabelDropdownProps {
  labels: StatusLabel[];
  currentId: string;
  onSelect: (id: string) => void;
  darkMode: boolean;
  onAddLabel?: (label: string, color: string) => void;
  onRemoveLabel?: (id: string) => void;
  onRenameLabel?: (id: string, newLabel: string) => void;
  onReorderLabels?: (labels: StatusLabel[]) => void;
  onUpdateLabelColor?: (id: string, newColor: string) => void;
  onToggleLabelContainer?: (id: string) => void;
  title?: string;
  addPlaceholder?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function LabelDropdown({
  labels,
  currentId,
  onSelect,
  darkMode,
  onAddLabel,
  onRemoveLabel,
  onRenameLabel,
  onReorderLabels,
  onUpdateLabelColor,
  onToggleLabelContainer,
  title: _title = 'Status',
  addPlaceholder = 'New label…',
  anchorRef,
}: LabelDropdownProps) {
  const [editMode, setEditMode] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newColor, setNewColor] = useState<string>(
    MONDAY_PALETTE[labels.length % MONDAY_PALETTE.length] || '#579bfc',
  );
  // Position is stored in a ref to avoid infinite re-render loops.
  // We apply it via useLayoutEffect directly to the DOM.
  const posRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });
  const triangleRef = useRef<HTMLDivElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeStatusMenu = useCallback(() => {
    import('../../stores/uiStore').then(({ useUIStore }) => {
      useUIStore.getState().closeStatusMenu();
    });
  }, []);

  useClickOutside(dropdownRef, closeStatusMenu, true);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editMode) setEditMode(false);
        else closeStatusMenu();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeStatusMenu, editMode]);

  // ─── Position: center dropdown on anchor with clamping ───
  useLayoutEffect(() => {
    if (!anchorRef?.current || !dropdownRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const dd = dropdownRef.current;
    const ddW = dd.offsetWidth;
    const anchorCenterX = anchor.left + anchor.width / 2;
    let left = anchorCenterX - ddW / 2;
    const margin = 8;
    if (left < margin) left = margin;
    if (left + ddW > window.innerWidth - margin) left = window.innerWidth - margin - ddW;
    // Shift up so the triangle overlaps the label slightly
    const top = anchor.bottom + 2;
    posRef.current = { top, left };
    dd.style.top = `${top}px`;
    dd.style.left = `${left}px`;
    // Position the triangle pointer via DOM to avoid stale render values
    if (triangleRef.current) {
      const triLeft = anchorCenterX - left;
      triangleRef.current.style.left = `${triLeft}px`;
    }
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = labels.findIndex((l) => l.id === active.id);
    const newIndex = labels.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderLabels?.(arrayMove(labels, oldIndex, newIndex));
  };

  const commitAdd = () => {
    const label = newLabel.trim();
    if (!label || !onAddLabel) return;
    onAddLabel(label, newColor);
    setNewLabel('');
    setShowAdd(false);
    setNewColor(MONDAY_PALETTE[(labels.length + 1) % MONDAY_PALETTE.length] || '#579bfc');
  };

  const handleAddKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitAdd();
    if (e.key === 'Escape') { setShowAdd(false); setNewLabel(''); }
  };

  const colCount = Math.max(1, Math.ceil(labels.length / 6));

  const bgColor = darkMode ? '#161a33' : '#ffffff';
  const borderColor = darkMode ? '#323652' : '#d1d5db';

  const dropdown = (
    <div
      ref={dropdownRef}
      className={`rounded-xl shadow-2xl border overflow-visible ${
        darkMode ? 'bg-[#161a33] border-[#323652]' : 'bg-white border-gray-300'
      }`}
      style={{
        position: anchorRef?.current ? 'fixed' : 'absolute' as const,
        top: anchorRef?.current ? 0 : '100%',
        left: anchorRef?.current ? 0 : 0,
        zIndex: 9999,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Triangle pointer */}
      {anchorRef?.current && (
        <div
          ref={triangleRef}
          style={{
            position: 'absolute',
            top: -6,
            left: 0,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderBottom: `7px solid ${borderColor}`,
            zIndex: 1,
          }}
        >
          {/* Inner triangle to fill with bg color */}
          <div
            style={{
              position: 'absolute',
              top: 1.5,
              left: -6,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: `6px solid ${bgColor}`,
            }}
          />
        </div>
      )}

      {/* ─── Label grid ─── */}
      <div
        className="p-2"
        style={{
          display: 'grid',
          gridTemplateRows: editMode
            ? undefined
            : `repeat(${Math.min(labels.length, 6)}, auto)`,
          gridTemplateColumns: editMode ? '1fr' : undefined,
          gridAutoFlow: editMode ? undefined : 'column',
          gridAutoColumns: editMode ? undefined : '1fr',
          gap: editMode ? 0 : 6,
          transition: 'gap 200ms ease',
          minWidth: editMode ? 260 : (colCount > 1 ? colCount * 130 : 150),
        }}
      >
        {editMode ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={labels.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {labels.map((l) => (
                <SortableLabelRow
                  key={l.id}
                  label={l}
                  editMode
                  isCurrent={l.id === currentId}
                  darkMode={darkMode}
                  onSelect={() => {}}
                  onRename={(name) => onRenameLabel?.(l.id, name)}
                  onColorChange={(color) => onUpdateLabelColor?.(l.id, color)}
                  onDelete={() => onRemoveLabel?.(l.id)}
                  onToggleContainer={onToggleLabelContainer ? () => onToggleLabelContainer(l.id) : undefined}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          labels.map((l) => (
            <LabelRow
              key={l.id}
              label={l}
              editMode={false}
              isCurrent={l.id === currentId}
              darkMode={darkMode}
              onSelect={() => { onSelect(l.id); closeStatusMenu(); }}
            />
          ))
        )}
      </div>

      {/* ─── Footer ─── */}
      <div className={`border-t ${darkMode ? 'border-[#323652]' : 'border-gray-100'}`}>
        {editMode && (
          <div className={`px-2.5 py-2`}>
            {showAdd ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={handleAddKeyDown}
                  placeholder={addPlaceholder}
                  className={`flex-1 h-7 px-2 rounded text-xs outline-none border ${
                    darkMode
                      ? 'bg-[#0f1224] border-[#323652] text-gray-200 placeholder-gray-500'
                      : 'bg-gray-50 border-gray-300 text-gray-700 placeholder-gray-400'
                  }`}
                />
                <button
                  onClick={commitAdd}
                  className="px-2 h-7 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                  darkMode
                    ? 'text-gray-400 hover:bg-[#0f1224] hover:text-gray-200'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
              >
                <Plus size={12} />
                New label
              </button>
            )}
          </div>
        )}

        <div className="px-2.5 py-2">
          <button
            onClick={() => { setEditMode(!editMode); setShowAdd(false); }}
            className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              editMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : darkMode
                  ? 'text-gray-400 hover:bg-[#0f1224] hover:text-gray-200'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {editMode ? 'Apply' : <><Pencil size={12} /> Edit Labels</>}
          </button>
        </div>
      </div>
    </div>
  );

  if (anchorRef?.current) {
    return createPortal(dropdown, document.body);
  }
  return dropdown;
}
