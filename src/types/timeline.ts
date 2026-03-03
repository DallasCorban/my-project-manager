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
  /** Visual slot index where the bin icon should render during resize-to-delete (null when not in delete mode) */
  deleteBinVisualSlot: number | null;
  origin: 'parent' | 'expanded' | null;
  /** Pixel position of the bar's left edge during drag (avoids store round-trip) */
  visualLeft: number;
  /** Pixel width of the bar during drag (avoids store round-trip) */
  visualWidth: number;
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
