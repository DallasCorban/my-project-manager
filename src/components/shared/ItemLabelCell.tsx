// ItemLabelCell — shared label-column content for Board and Gantt item rows.
// Renders the expand/collapse chevron, task name, and right-side hover buttons
// (subitem count badge, comment icon, plus). Used by TaskRow and GanttTaskRow.

import { CornerDownRight, ChevronRight, Plus, MessageSquare } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { EditableText } from './EditableText';
import type { Item, Subitem } from '../../types/item';

interface ItemLabelCellProps {
  task: Item | Subitem;
  isSubitem?: boolean;
  canEdit?: boolean;
  darkMode: boolean;
  onUpdateName?: (value: string) => void;
  onAddSubitem?: () => void;
  onOpenUpdates?: () => void;
}

export function ItemLabelCell({
  task,
  isSubitem = false,
  canEdit = true,
  darkMode,
  onUpdateName,
  onAddSubitem,
  onOpenUpdates,
}: ItemLabelCellProps) {
  const expandedItems = useUIStore((s) => s.expandedItems);
  const toggleItemExpand = useUIStore((s) => s.toggleItemExpand);

  const hasSubitems = !isSubitem && 'subitems' in task && (task as Item).subitems.length > 0;
  const subitemCount = hasSubitems ? (task as Item).subitems.length : 0;

  return (
    <div className={`flex items-center gap-2 w-full ${isSubitem ? 'pl-8' : ''}`}>
      {/* Subitem indent indicator */}
      {isSubitem && <CornerDownRight size={12} className="text-gray-400 shrink-0" />}

      {/* Expand / collapse chevron — parent tasks only.
          data-no-dnd: isolates this click target from SmartPointerSensor so
          that clicking the chevron never accidentally starts a row drag. */}
      {!isSubitem && (
        <div
          data-no-dnd
          onClick={(e) => {
            e.stopPropagation();
            if (hasSubitems) toggleItemExpand(task.id);
          }}
          className={`shrink-0 transition-transform duration-150 ${
            hasSubitems
              ? 'cursor-pointer text-gray-400 hover:text-blue-500'
              : 'cursor-default text-gray-300 opacity-30'
          } ${expandedItems.includes(task.id) ? 'rotate-90' : ''}`}
        >
          <ChevronRight size={14} />
        </div>
      )}

      {/* Task / subitem name */}
      <EditableText
        value={task.name}
        onChange={canEdit ? onUpdateName : undefined}
        readOnly={!canEdit}
        className={`text-sm ${isSubitem ? 'text-xs' : ''} ${
          darkMode ? 'text-gray-200' : 'text-[#323338]'
        }`}
      />

      {/* Right-side hover buttons — parent tasks only */}
      {!isSubitem && (
        <div className="flex items-center gap-1 ml-auto no-drag shrink-0">
          {/* Subitem count badge */}
          {hasSubitems && (
            <span className={`text-[10px] px-1.5 rounded-full ${
              darkMode ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-600'
            }`}>
              {subitemCount}
            </span>
          )}

          {/* Open updates */}
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

          {/* Add subitem */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!canEdit) return;
              onAddSubitem?.();
            }}
            className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${
              canEdit
                ? darkMode
                  ? 'hover:bg-white/10 text-gray-400 hover:text-blue-400'
                  : 'hover:bg-gray-200 text-gray-400 hover:text-blue-600'
                : 'text-gray-500/60 cursor-not-allowed'
            }`}
            disabled={!canEdit}
            title="Add subitem"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
