// GanttBar — draggable timeline bar for a task or subitem.
// Handles move, resize-left, resize-right interactions.

import { Trash2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { DragState } from '../../types/timeline';

interface GanttBarProps {
  left: number;
  width: number;
  color: string;
  label: string;
  showLabel: boolean;
  zoomLevel: number;
  isSubitem?: boolean;
  /** Currently active drag state (to show delete mode) */
  dragState: DragState;
  taskId: string;
  subitemId: string | null;
  onMouseDown: (e: React.MouseEvent, type: DragState['type']) => void;
}

export function GanttBar({
  left,
  width,
  color,
  label,
  showLabel,
  zoomLevel,
  isSubitem = false,
  dragState,
  taskId,
  subitemId,
  onMouseDown,
}: GanttBarProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  const isThisBarDragging =
    dragState.isDragging &&
    dragState.taskId === taskId &&
    dragState.subitemId === subitemId;

  const isDeleteMode = isThisBarDragging && dragState.isDeleteMode;

  const barHeight = isSubitem ? 'h-2/3' : 'h-3/4';

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 ${barHeight} rounded-sm flex items-center
        shadow-sm cursor-grab active:cursor-grabbing select-none
        transition-opacity ${isDeleteMode ? 'opacity-30' : 'opacity-100'}
        ${darkMode ? 'border border-[#181b34]' : 'border border-white'}`}
      style={{
        left,
        width: Math.max(width, zoomLevel * 0.5),
        backgroundColor: color,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e, 'move');
      }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-white/30 rounded-l-sm"
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e, 'resize-left');
        }}
      />

      {/* Label text */}
      {showLabel && zoomLevel > 15 && width > 30 && (
        <span className="text-[9px] text-white pl-1.5 truncate pointer-events-none leading-none">
          {label}
        </span>
      )}

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-[3px] cursor-col-resize hover:bg-white/30 rounded-r-sm"
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e, 'resize-right');
        }}
      />

      {/* Delete mode indicator */}
      {isDeleteMode && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-red-500 animate-pulse">
          <Trash2 size={14} />
        </div>
      )}
    </div>
  );
}
