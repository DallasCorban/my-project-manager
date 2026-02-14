// GanttBar — draggable timeline bar for a task or subitem.
// Handles move, resize-left, resize-right interactions.
// Larger drag handles (10px) and hover X button for deletion.

import { useState } from 'react';
import { X } from 'lucide-react';
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
  onDelete?: () => void;
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
  onDelete,
}: GanttBarProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [isHovered, setIsHovered] = useState(false);

  const isThisBarDragging =
    dragState.isDragging &&
    dragState.taskId === taskId &&
    dragState.subitemId === subitemId;

  const isDeleteMode = isThisBarDragging && dragState.isDeleteMode;

  const barHeight = isSubitem ? 'h-2/3' : 'h-3/4';

  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 ${barHeight} rounded-md flex items-center
        shadow-sm cursor-grab active:cursor-grabbing select-none
        ${isDeleteMode ? 'opacity-30' : 'opacity-100'}
        ${darkMode ? 'border border-[#181b34]' : 'border border-white/50'}`}
      style={{
        left,
        width: Math.max(width, zoomLevel * 0.5),
        backgroundColor: color,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onMouseDown(e, 'move');
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left resize handle — 10px wide, extends outside */}
      <div
        className="absolute -left-1 top-0 h-full w-[10px] cursor-ew-resize z-10 group/handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e, 'resize-left');
        }}
      >
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-full bg-white/40 group-hover/handle:bg-white/70 transition-colors" />
      </div>

      {/* Label text */}
      {showLabel && zoomLevel > 15 && width > 30 && (
        <span className="text-[9px] text-white pl-3 truncate pointer-events-none leading-none flex-1 min-w-0">
          {label}
        </span>
      )}

      {/* Right resize handle — 10px wide, extends outside */}
      <div
        className="absolute -right-1 top-0 h-full w-[10px] cursor-ew-resize z-10 group/handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDown(e, 'resize-right');
        }}
      >
        <div className="absolute right-1 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-full bg-white/40 group-hover/handle:bg-white/70 transition-colors" />
      </div>

      {/* Delete button — appears on hover, top-right */}
      {isHovered && onDelete && !dragState.isDragging && (
        <button
          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <X size={10} />
        </button>
      )}

      {/* Delete mode overlay */}
      {isDeleteMode && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/60 text-[10px] font-medium">Drop to clear</div>
        </div>
      )}
    </div>
  );
}
