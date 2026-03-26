// ItemLabelCell — shared label-column content for Board and Gantt item rows.
// Renders the expand/collapse chevron, task name, and right-side hover buttons
// (subitem count badge, comment icon, plus). Used by TaskRow and GanttTaskRow.

import { CornerDownRight, ChevronRight, Plus, MessageSquare } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { EditableText } from './EditableText';
import type { Item, Subitem, SubSubitem } from '../../types/item';

interface ItemLabelCellProps {
  task: Item | Subitem | SubSubitem;
  isSubitem?: boolean;
  /** Nesting depth: 0 = item, 1 = subitem, 2 = sub-subitem */
  nestingLevel?: number;
  canEdit?: boolean;
  darkMode: boolean;
  onUpdateName?: (value: string) => void;
  onAddSubitem?: () => void;
  onOpenUpdates?: () => void;
}

export function ItemLabelCell({
  task,
  isSubitem = false,
  nestingLevel,
  canEdit = true,
  darkMode,
  onUpdateName,
  onAddSubitem,
  onOpenUpdates,
}: ItemLabelCellProps) {
  const expandedItems = useUIStore((s) => s.expandedItems);
  const toggleItemExpand = useUIStore((s) => s.toggleItemExpand);
  const showEmptyNameToast = useUIStore((s) => s.showEmptyNameToast);

  // Derive effective nesting level from explicit prop or legacy isSubitem
  const depth = nestingLevel ?? (isSubitem ? 1 : 0);
  const isLeaf = depth >= 2;

  // Check for children at levels 0 and 1
  const hasChildren =
    depth === 0
      ? 'subitems' in task && (task as Item).subitems.length > 0
      : depth === 1
        ? 'subitems' in task && ((task as Subitem).subitems || []).length > 0
        : false;
  const childCount = hasChildren
    ? depth === 0
      ? (task as Item).subitems.length
      : ((task as Subitem).subitems || []).length
    : 0;

  // Indentation: pl-0 for items, pl-8 for subitems, pl-16 for sub-subitems
  const indentClass = depth === 0 ? '' : depth === 1 ? 'pl-8' : 'pl-16';

  return (
    <div className={`flex items-center gap-2 w-full ${indentClass}`}>
      {/* Indent indicator for nested items */}
      {depth > 0 && <CornerDownRight size={12} className="text-gray-400 shrink-0" />}

      {/* Expand / collapse chevron — levels 0 and 1 (not leaf).
          data-no-dnd: isolates this click target from SmartPointerSensor so
          that clicking the chevron never accidentally starts a row drag. */}
      {!isLeaf && (
        <div
          data-no-dnd
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleItemExpand(task.id);
          }}
          className={`shrink-0 transition-transform duration-150 ${
            hasChildren
              ? 'cursor-pointer text-gray-400 hover:text-blue-500'
              : 'cursor-default text-gray-300 opacity-30'
          } ${hasChildren && expandedItems.includes(task.id) ? 'rotate-90' : ''}`}
        >
          <ChevronRight size={14} />
        </div>
      )}

      {/* Task / subitem name */}
      <EditableText
        value={task.name}
        onChange={canEdit ? onUpdateName : undefined}
        readOnly={!canEdit}
        revertOnEmpty
        onEmpty={showEmptyNameToast}
        className={`text-xs ${
          darkMode ? 'text-gray-200' : 'text-[#323338]'
        }`}
      />

      {/* Right-side hover buttons — levels 0 and 1 (not leaf) */}
      {!isLeaf && (
        <div className="flex items-center gap-1 ml-auto no-drag shrink-0">
          {/* Child count badge */}
          {hasChildren && (
            <span className={`text-[10px] px-1.5 rounded-full ${
              darkMode ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-600'
            }`}>
              {childCount}
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

          {/* Add child */}
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
            title={depth === 0 ? 'Add subitem' : 'Add sub-subitem'}
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
