export interface TimelineDay {
  index: number;          // relative index from today (0 = today)
  dayNum: number;
  dayName: string;
  monthName: string;
  isWeekend: boolean;
  isMonday: boolean;
  isToday: boolean;
  weekLabel: string;
  visualIndex?: number;
  isEndOfWeekToday?: boolean;
}

export interface DragState {
  isDragging: boolean;
  type: 'move' | 'create' | 'resize-left' | 'resize-right' | null;
  taskId: string | null;
  subitemId: string | null;
  projectId: string | null;
  startX: number;
  originalStart: number;
  originalDuration: number;
  currentSpan: number;
  currentVisualSlot: number;
  hasMoved: boolean;
  isDeleteMode: boolean;
  origin: 'parent' | 'expanded' | null;
}

export interface ReorderDrag {
  active: boolean;
  type: 'task' | 'subitem' | null;
  dragId: string | null;
  parentId: string | null;
  dropTargetId: string | null;
  dropTargetType: 'row' | 'group' | null;
  dropTargetProjectId: string | null;
  sourceProjectId: string | null;
  dropPosition: 'before' | 'after';
  originalExpanded: boolean;
}

export interface BoardColumns {
  select: number;
  item: number;
  person: number;
  status: number;
  type: number;
  date: number;
}

export interface DatePickerState {
  taskId: string;
  subitemId: string | null;
  projectId: string;
}

export interface UpdatesPanelTarget {
  taskId: string;
  subitemId: string | null;
  projectId: string;
}
