// GanttBar — draggable timeline bar for a task or subitem.
// Handles move, resize-left, resize-right interactions.
// Larger drag handles (10px) and hover X button for deletion.
//
// Height is a fixed pixel value derived from rowHeight (never changes with
// overlap count). Vertical position uses `top: calc(50% + offsetY)` so that
// overlap only nudges bars, never resizes them.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { DragState } from '../../types/timeline';

/** Clamp a value between min and max. */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

interface GanttBarProps {
  left: number;
  width: number;
  color: string;
  label: string;
  showLabel: boolean;
  zoomLevel: number;
  rowHeight: number;
  /** Vertical offset in px from center. 0 = centered, negative = up, positive = down. */
  verticalOffsetPx?: number;
  isSubitem?: boolean;
  /** Currently active drag state (to show delete mode) */
  dragState: DragState;
  taskId: string;
  subitemId: string | null;
  onMouseDown: (e: React.PointerEvent, type: DragState['type']) => void;
  onDelete?: () => void;
  /** Called when hover state changes — used by stack to promote hovered bar z-order. */
  onHoverChange?: (hovered: boolean) => void;
  /** Double-clicking the bar toggles the updates panel for this item. */
  onOpenUpdates?: () => void;
  /** True when this bar is the current zoom-anchor selection. */
  isSelected?: boolean;
  /** Called when the user single-clicks this bar to select it as the zoom anchor. */
  onSelect?: () => void;
}

export function GanttBar({
  left,
  width,
  color,
  label,
  showLabel,
  zoomLevel,
  rowHeight,
  verticalOffsetPx = 0,
  isSubitem: _isSubitem = false,
  dragState,
  taskId,
  subitemId,
  onMouseDown,
  onDelete,
  onHoverChange,
  onOpenUpdates,
  isSelected = false,
  onSelect,
}: GanttBarProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [isHovered, setIsHovered] = useState(false);

  const isThisBarDragging =
    dragState.isDragging &&
    dragState.taskId === taskId &&
    dragState.subitemId === subitemId;

  const isDeleteMode = isThisBarDragging && dragState.isDeleteMode;

  // Resize handle pills are visible only while hovering this bar or while an
  // interaction (move / resize) is active on it.  The 10 px hit-target divs
  // remain in the DOM at all times so cursor feedback and pointer events still
  // work even when the pill is invisible.
  const showHandles = isHovered || isThisBarDragging;

  // Fixed pixel height: ~72% of row height, clamped to a sensible range.
  // This NEVER changes based on overlap/lane count.
  const barHeightPx = clamp(Math.round(rowHeight * 0.72), 14, 24);

  return (
    <div
      className={`absolute rounded-md flex items-center
        shadow-sm cursor-grab active:cursor-grabbing select-none pointer-events-auto
        ${isDeleteMode ? 'opacity-30' : 'opacity-100'}
        ${darkMode ? 'border border-[#181b34]' : 'border border-white/50'}
        ${isSelected ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-transparent' : ''}`}
      style={{
        left,
        width: Math.max(width, zoomLevel * 0.5),
        height: barHeightPx,
        top: `calc(50% + ${verticalOffsetPx}px)`,
        transform: 'translateY(-50%)',
        backgroundColor: color,
        touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onMouseDown(e, 'move');
      }}
      onClick={(e) => {
        // Single-click selects this bar as the zoom anchor.
        // stopPropagation prevents the background handler in GanttTaskRow from
        // also firing and immediately clearing the selection.
        e.stopPropagation();
        onSelect?.();
      }}
      onDoubleClick={(e) => {
        // Double-click on the bar body (not on handles or delete) toggles the
        // updates panel. The browser only fires dblclick when the pointer hasn't
        // moved significantly between clicks, so drag interactions are safe.
        e.stopPropagation();
        onOpenUpdates?.();
      }}
      onPointerEnter={() => { setIsHovered(true); onHoverChange?.(true); }}
      onPointerLeave={() => { setIsHovered(false); onHoverChange?.(false); }}
    >
      {/* Left resize handle — 10px wide, extends outside */}
      <div
        className="absolute -left-1 top-0 h-full w-[10px] cursor-ew-resize z-10 group/handle"
        onPointerDown={(e) => {
          e.stopPropagation();
          onMouseDown(e, 'resize-left');
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className={`absolute left-1 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-full bg-white/40 group-hover/handle:bg-white/70 transition-[colors,opacity] ${showHandles ? 'opacity-100' : 'opacity-0'}`} />
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
        onPointerDown={(e) => {
          e.stopPropagation();
          onMouseDown(e, 'resize-right');
        }}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className={`absolute right-1 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-full bg-white/40 group-hover/handle:bg-white/70 transition-[colors,opacity] ${showHandles ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      {/* Delete button — appears on hover, top-right */}
      {isHovered && onDelete && !dragState.isDragging && (
        <button
          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
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
