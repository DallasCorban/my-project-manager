// Column header row for the board table view with resize handles.
// Supports drag-and-drop column reordering via a nested DndContext.
// select + item are pinned; person/status/type/date are reorderable.

import { Square, GripVertical } from 'lucide-react';
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
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUIStore } from '../../stores/uiStore';
import type { BoardColumns, DraggableColumnKey } from '../../types/timeline';

type ColumnKey = keyof BoardColumns;

// Column display config
const COLUMN_LABELS: Record<DraggableColumnKey, string> = {
  person: 'People',
  status: 'Status',
  type: 'Type',
  itemType: 'Item Type',
  date: 'Date',
};

// ─── Sortable column header ────────────────────────────────────────────────

function SortableColumnHeader({
  colKey,
  width,

  onStartResize,
  darkMode,
}: {
  colKey: DraggableColumnKey;
  width: number;
  onStartResize: (key: ColumnKey, clientX: number) => void;
  darkMode: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: colKey });

  const resizerClass = `absolute right-0 top-0 bottom-0 w-1 cursor-col-resize ${
    darkMode ? 'hover:bg-blue-500/30' : 'hover:bg-blue-400/30'
  }`;

  const cellBase = `flex shrink-0 items-center py-2 relative min-w-0 ${
    darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'
  }`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    width,
  };

  return (
    <div
      ref={setNodeRef}
      className={`${cellBase} px-4 justify-center border-r`}
      style={style}
      data-no-dnd
      {...attributes}
    >
      <div
        className="relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        {...listeners}
      >
        <GripVertical size={12} className="absolute -left-4 opacity-0 group-hover/header:opacity-40 transition-opacity" />
        <span className="truncate">{COLUMN_LABELS[colKey]}</span>
      </div>
      <div
        className={resizerClass}
        onMouseDown={(e) => {
          e.stopPropagation();
          onStartResize(colKey, e.clientX);
        }}
      />
    </div>
  );
}

// ─── Main header row ────────────────────────────────────────────────────────

interface GroupHeaderRowProps {
  boardColumns: BoardColumns;
  columnOrder: DraggableColumnKey[];
  onStartResize: (key: ColumnKey, clientX: number) => void;
  onReorderColumns: (order: DraggableColumnKey[]) => void;
}

export function GroupHeaderRow({
  boardColumns: col,
  columnOrder,
  onStartResize,
  onReorderColumns,
}: GroupHeaderRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columnOrder.indexOf(active.id as DraggableColumnKey);
    const newIndex = columnOrder.indexOf(over.id as DraggableColumnKey);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderColumns(arrayMove(columnOrder, oldIndex, newIndex));
  };

  const resizerClass = `absolute right-0 top-0 bottom-0 w-1 cursor-col-resize ${
    darkMode ? 'hover:bg-blue-500/30' : 'hover:bg-blue-400/30'
  }`;

  const cellBase = `border-r flex shrink-0 items-center py-2 relative min-w-0 ${
    darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'
  }`;

  return (
    <div
      className={`flex w-fit min-w-full border-b text-xs font-bold text-gray-500 uppercase tracking-wide group/header ${
        darkMode ? 'bg-[#181b34] border-[#323652]' : 'bg-white border-[#bec3d4]'
      }`}
    >
      {/* Pinned: Select */}
      <div className={`${cellBase} justify-center`} style={{ width: col.select }}>
        <Square size={14} className="opacity-50" />
        <div className={resizerClass} onMouseDown={(e) => { e.stopPropagation(); onStartResize('select', e.clientX); }} />
      </div>

      {/* Pinned: Item */}
      <div className={`${cellBase} px-4`} style={{ width: col.item }}>
        <span className="truncate">Item</span>
        <div className={resizerClass} onMouseDown={(e) => { e.stopPropagation(); onStartResize('item', e.clientX); }} />
      </div>

      {/* Draggable columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
          {columnOrder.map((key, i) => (
            <SortableColumnHeader
              key={key}
              colKey={key}
              width={col[key]}

              onStartResize={onStartResize}
              darkMode={darkMode}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
