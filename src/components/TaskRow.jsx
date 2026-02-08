import React, { useLayoutEffect, useRef, useState } from "react";
import {
  CheckSquare,
  Square,
  CornerDownRight,
  ChevronRight,
  Plus,
  Edit2,
  Check,
} from "lucide-react";

import { addDaysToKey, formatDateKey } from "../utils/date";

/**
 * Simple inline editable text component (self-contained).
 * Keeps the old App.jsx "event-like" onChange signature: onChange({ target: { value } })
 */
function EditableText({ value, onChange, className = "", style, placeholder }) {
  const spanRef = useRef(null);
  const [width, setWidth] = useState("auto");

  useLayoutEffect(() => {
    if (spanRef.current) {
      setWidth(`${Math.max(20, spanRef.current.offsetWidth + 12)}px`);
    }
  }, [value, placeholder]);

  return (
    <div className="relative max-w-full flex items-center no-drag">
      <span
        ref={spanRef}
        className={`absolute opacity-0 pointer-events-none whitespace-pre px-1 ${className}`}
        style={style}
        aria-hidden="true"
      >
        {value || placeholder || ""}
      </span>

      <input
        value={value ?? ""}
        onChange={onChange}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        className={`bg-transparent border border-transparent hover:border-gray-400/50 rounded px-1 -ml-1 transition-all outline-none cursor-text truncate ${className}`}
        style={{ ...(style || {}), width }}
      />
    </div>
  );
}

const StatusDropdown = ({ statuses, currentStatusId, onSelect, darkMode, onEdit }) => {
  return (
    <div
      className={`rounded-md border shadow-lg overflow-hidden ${
        darkMode ? "bg-[#111827] border-[#2b2c32]" : "bg-white border-[#eceff8]"
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
          Status
        </div>
        <button
          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
            darkMode ? "bg-white/5 hover:bg-white/10 text-gray-200" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
          }`}
          onClick={() => onEdit?.("status")}
          type="button"
        >
          <Edit2 size={12} />
          Edit
        </button>
      </div>

      <div className="max-h-64 overflow-auto">
        {statuses.map((s) => {
          const isCurrent = s.id === currentStatusId;
          return (
            <button
              key={s.id}
              className={`w-full px-3 py-2 flex items-center gap-2 text-left text-xs transition ${
                darkMode ? "hover:bg-white/5 text-gray-200" : "hover:bg-gray-50 text-gray-800"
              }`}
              onClick={() => onSelect?.(s.id)}
              type="button"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex-1">{s.label}</span>
              {isCurrent && <Check size={14} className="opacity-70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const TypeDropdown = ({ jobTypes, currentTypeId, onSelect, darkMode, onEdit }) => {
  return (
    <div
      className={`rounded-md border shadow-lg overflow-hidden ${
        darkMode ? "bg-[#111827] border-[#2b2c32]" : "bg-white border-[#eceff8]"
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
          Type
        </div>
        <button
          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
            darkMode ? "bg-white/5 hover:bg-white/10 text-gray-200" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
          }`}
          onClick={() => onEdit?.("type")}
          type="button"
        >
          <Edit2 size={12} />
          Edit
        </button>
      </div>

      <div className="max-h-64 overflow-auto">
        {jobTypes.map((t) => {
          const isCurrent = t.id === currentTypeId;
          return (
            <button
              key={t.id}
              className={`w-full px-3 py-2 flex items-center gap-2 text-left text-xs transition ${
                darkMode ? "hover:bg-white/5 text-gray-200" : "hover:bg-gray-50 text-gray-800"
              }`}
              onClick={() => onSelect?.(t.id)}
              type="button"
            >
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span className="flex-1">{t.label}</span>
              {isCurrent && <Check size={14} className="opacity-70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default function TaskRow({
  task,
  projectId,
  parentId,
  isSubitem,
  isDragging: isDraggingProp,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isSelected,
  onToggle,
  onAddSubitem,
  activeTab,
  darkMode,
  statuses,
  jobTypes,
  expandedItems,
  toggleItemExpand,
  updateTaskName,
  updateSubitemName,
  statusMenuOpen,
  statusMenuType,
  setStatusMenuOpen,
  setStatusMenuType,
  setDatePickerOpen,
  onStatusSelect,
  onTypeSelect,
  onEditLabels,
  reorderDrag,
}) {
  const dragBlockRef = useRef(false);
  const hasSubitems = task.subitems && task.subitems.length > 0;

  const statusColor = statuses.find((s) => s.id === task.status)?.color || "#c4c4c4";
  const statusLabel = statuses.find((s) => s.id === task.status)?.label || "Status";

  const typeColor = jobTypes.find((t) => t.id === task.jobTypeId)?.color || "#c4c4c4";
  const typeLabel = jobTypes.find((t) => t.id === task.jobTypeId)?.label || "Type";

  const hasDates = task.start !== null && task.start !== undefined;
  const safeDuration = Math.max(1, Number(task.duration || 1));
  const endKey = hasDates ? addDaysToKey(task.start, safeDuration - 1) : null;
  const showRange = hasDates && safeDuration > 1;

  const isRowDragging = Boolean(isDraggingProp);
  const containerStyle = isRowDragging
    ? `flex border-b items-center h-10 relative group ${
        darkMode ? "bg-blue-500/10 border-blue-500/50" : "bg-blue-50 border-blue-300"
      } border-dashed opacity-50`
    : `flex border-b transition-colors items-center h-10 relative group ${
        darkMode ? "border-[#2b2c32] hover:bg-[#202336] bg-[#1c213e]" : "border-[#eceff8] hover:bg-[#f0f0f0] bg-white"
      }`;

  return (
    <div
      className={containerStyle}
      draggable="true"
      onMouseDownCapture={(e) => {
        const target = e.target;
        const isInteractive =
          ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(target.tagName) ||
          target.closest(".no-drag") ||
          target.getAttribute("contenteditable") === "true";
        dragBlockRef.current = Boolean(isInteractive);
      }}
      onMouseUp={() => {
        dragBlockRef.current = false;
      }}
      onMouseLeave={() => {
        dragBlockRef.current = false;
      }}
      onDragStart={(e) => {
        if (dragBlockRef.current) {
          e.preventDefault();
          return;
        }
        if (
          ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(e.target.tagName) ||
          e.target.closest(".no-drag")
        ) {
          e.preventDefault();
          return;
        }
        if (onDragStart) onDragStart(e, isSubitem ? "subitem" : "task", task.id);
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        if (onDrop) onDrop(e, isSubitem ? "subitem" : "task", task.id);
      }}
      onDragEnd={onDragEnd}
    >
      <div
        className={`w-10 border-r h-full flex items-center justify-center relative no-drag ${
          darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`cursor-pointer transition-all duration-200 ${
            isSelected ? "text-blue-500 opacity-100" : "text-gray-400 opacity-50 group-hover:opacity-100 hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task.id);
          }}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </div>
      </div>

      <div className={`w-[450px] border-r h-full flex items-center px-4 relative ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}>
        <div className={`flex items-center gap-2 w-full ${isSubitem ? "pl-10" : ""}`}>
          {isSubitem && <CornerDownRight size={12} className="text-gray-400 shrink-0" />}

          {!isSubitem && (
            <div
              onClick={hasSubitems ? () => toggleItemExpand(task.id) : undefined}
              className={`mr-2 transition-colors ${
                hasSubitems ? "cursor-pointer text-gray-400 hover:text-blue-500" : "cursor-default text-gray-300 opacity-30"
              } ${expandedItems.includes(task.id) ? "rotate-90" : ""}`}
            >
              <ChevronRight size={14} />
            </div>
          )}

          <EditableText
            value={task.name}
            onChange={(e) =>
              isSubitem
                ? updateSubitemName(projectId, parentId, task.id, e.target.value)
                : updateTaskName(projectId, task.id, e.target.value)
            }
            className={`text-sm ${darkMode ? "text-gray-200" : "text-[#323338]"}`}
          />

          {!isSubitem && (
            <div className="flex items-center gap-2 ml-auto no-drag">
              {hasSubitems && (
                <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 rounded-full">{task.subitems.length}</span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSubitem(projectId, task.id);
                }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === "board" && (
        <>
          <div className={`w-28 border-r h-full flex items-center justify-center ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}>
            <div className="w-6 h-6 rounded-full bg-gray-400 text-[10px] flex items-center justify-center text-white border-2 border-transparent shadow-sm">
              {task.assignee?.charAt(0)}
            </div>
          </div>

          <div className={`w-36 border-r h-full flex items-center justify-center px-2 relative ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}>
            <div
              onClick={(e) => {
                e.stopPropagation();
                setStatusMenuOpen(task.id);
                setStatusMenuType("status");
              }}
              className="w-full h-8 flex items-center justify-center text-xs font-medium text-white rounded-sm cursor-pointer transition hover:opacity-90"
              style={{ backgroundColor: statusColor }}
            >
              {statusLabel}
            </div>

            {statusMenuOpen === task.id && statusMenuType === "status" && (
              <div className="absolute top-full w-full left-0 z-[100]">
                <StatusDropdown
                  statuses={statuses}
                  currentStatusId={task.status}
                  onSelect={(id) => onStatusSelect(projectId, task.id, isSubitem ? task.id : null, id)}
                  darkMode={darkMode}
                  onEdit={onEditLabels}
                />
              </div>
            )}
          </div>

          <div className={`w-36 border-r h-full flex items-center justify-center px-2 relative ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}>
            <div
              onClick={(e) => {
                e.stopPropagation();
                setStatusMenuOpen(task.id);
                setStatusMenuType("type");
              }}
              className="w-full h-8 flex items-center justify-center text-xs font-medium text-white rounded-sm cursor-pointer transition hover:opacity-90"
              style={{ backgroundColor: typeColor }}
            >
              {typeLabel}
            </div>

            {statusMenuOpen === task.id && statusMenuType === "type" && (
              <div className="absolute top-full w-full left-0 z-[100]">
                <TypeDropdown
                  jobTypes={jobTypes}
                  currentTypeId={task.jobTypeId}
                  onSelect={(id) => onTypeSelect(projectId, task.id, isSubitem ? task.id : null, id)}
                  darkMode={darkMode}
                  onEdit={onEditLabels}
                />
              </div>
            )}
          </div>

          <div
            className={`w-48 h-full flex items-center justify-center px-4 cursor-pointer relative ${darkMode ? "hover:bg-white/5" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setDatePickerOpen({
                projectId,
                taskId: isSubitem ? parentId : task.id,
                subitemId: isSubitem ? task.id : null,
                start: task.start,
                duration: task.duration,
                el: e.currentTarget,
              });
            }}
          >
            {hasDates ? (
              <span className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                {formatDateKey(task.start)}
                {showRange ? ` – ${formatDateKey(endKey)}` : ""}
              </span>
            ) : (
  <div
    className={`px-2 py-1 rounded border border-dashed text-[10px] ${
      darkMode
        ? "border-gray-600 text-gray-500"
        : "border-gray-300 text-gray-400"
    }`}
  >
    Set Dates
  </div>
            )}

          </div>
        </>
      )}

      {reorderDrag?.active && reorderDrag.dropTargetId === task.id && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-blue-500 z-50 pointer-events-none"
          style={{
            top: reorderDrag.dropPosition === "before" ? "-1px" : "auto",
            bottom: reorderDrag.dropPosition === "after" ? "-1px" : "auto",
          }}
        />
      )}
    </div>
  );
}
