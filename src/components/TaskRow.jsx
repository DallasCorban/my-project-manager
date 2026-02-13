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

import { addDaysToKey, formatDateKey, normalizeDateKey } from "../utils/date";

/**
 * Simple inline editable text component (self-contained).
 * Keeps the old App.jsx "event-like" onChange signature: onChange({ target: { value } })
 */
function EditableText({ value, onChange, className = "", style, placeholder, readOnly = false }) {
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
        readOnly={readOnly}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        className={`bg-transparent border border-transparent rounded px-1 -ml-1 transition-all outline-none truncate ${
          readOnly ? "cursor-default" : "cursor-text hover:border-gray-400/50"
        } ${className}`}
        style={{ ...(style || {}), width }}
      />
    </div>
  );
}

const MONDAY_PALETTE = [
  "#00c875",
  "#9cd326",
  "#cab641",
  "#ffcb00",
  "#fdab3d",
  "#ff642e",
  "#e2445c",
  "#ff007f",
  "#ff5ac4",
  "#ffcead",
  "#a25ddc",
  "#784bd1",
  "#579bfc",
  "#0086c0",
  "#595ad4",
  "#037f4c",
  "#00ca72",
  "#3b85f6",
  "#175a63",
  "#333333",
  "#7f5f3f",
  "#dff0ff",
  "#304575",
  "#7f8c8d",
  "#c4c4c4",
  "#808080",
  "#111111",
  "#b5c0d0",
];

const StatusDropdown = ({ statuses, currentStatusId, onSelect, darkMode, onEdit, onAddLabel }) => {
  const [query, setQuery] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(MONDAY_PALETTE[statuses.length % MONDAY_PALETTE.length] || "#579bfc");

  const filtered = statuses.filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase()));

  const commitAdd = () => {
    const label = newLabel.trim();
    if (!label || !onAddLabel) return;
    onAddLabel(label, newColor);
    setNewLabel("");
    setQuery("");
    setNewColor(MONDAY_PALETTE[(statuses.length + 1) % MONDAY_PALETTE.length] || "#579bfc");
  };

  return (
    <div
      className={`w-64 rounded-2xl shadow-2xl border overflow-hidden ${
        darkMode ? "bg-[#161a33] border-[#2b2c32]" : "bg-white border-gray-200"
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
        Status
      </div>
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search status…"
          className={`w-full h-8 px-2.5 rounded-md text-xs outline-none border ${
            darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400"
          }`}
        />
      </div>
      <div className="py-1 max-h-56 overflow-y-auto">
        {filtered.length === 0 && (
          <div className={`px-3 py-4 text-xs text-center ${darkMode ? "text-gray-500" : "text-gray-400"}`}>No matches</div>
        )}
        {filtered.map((s) => {
          const isCurrent = s.id === currentStatusId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect?.(s.id)}
              className={`mx-2 my-0.5 px-2.5 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 rounded-lg transition-colors ${
                isCurrent
                  ? darkMode
                    ? "bg-blue-500/20 text-white"
                    : "bg-blue-50 text-blue-700"
                  : darkMode
                  ? "hover:bg-[#0f1224] text-gray-200"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              <div className="w-3.5 h-3.5 rounded-sm shrink-0 ring-1 ring-white/20" style={{ backgroundColor: s.color }}></div>
              <span className="flex-1">{s.label}</span>
              {isCurrent && <Check size={12} className="opacity-70" />}
            </div>
          );
        })}
      </div>
      <div className={`px-3 py-3 border-t ${darkMode ? "border-[#2b2c32]" : "border-gray-100"}`}>
        <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Add Label
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
            }}
            placeholder="New status…"
            className={`flex-1 h-8 px-2.5 rounded-md text-xs outline-none border ${
              darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400"
            }`}
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
          />
        </div>
        <button
          onClick={commitAdd}
          className={`mt-2 w-full h-8 rounded-md text-xs font-semibold transition-colors ${
            darkMode ? "bg-blue-600/90 hover:bg-blue-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          type="button"
        >
          Add Status
        </button>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
        className={`w-full px-4 py-2.5 text-[11px] font-semibold border-t flex items-center gap-2 transition-colors ${
          darkMode ? "border-[#2b2c32] text-blue-300 hover:bg-[#0f1224]" : "border-gray-100 text-blue-600 hover:bg-gray-50"
        }`}
        type="button"
      >
        <Edit2 size={12} /> Manage Status Labels
      </button>
    </div>
  );
};

const TypeDropdown = ({ jobTypes, currentTypeId, onSelect, darkMode, onEdit, onAddLabel }) => {
  const [query, setQuery] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(MONDAY_PALETTE[jobTypes.length % MONDAY_PALETTE.length] || "#579bfc");

  const filtered = jobTypes.filter((t) => t.label.toLowerCase().includes(query.trim().toLowerCase()));

  const commitAdd = () => {
    const label = newLabel.trim();
    if (!label || !onAddLabel) return;
    onAddLabel(label, newColor);
    setNewLabel("");
    setQuery("");
    setNewColor(MONDAY_PALETTE[(jobTypes.length + 1) % MONDAY_PALETTE.length] || "#579bfc");
  };

  return (
    <div
      className={`w-64 rounded-2xl shadow-2xl border overflow-hidden ${
        darkMode ? "bg-[#161a33] border-[#2b2c32]" : "bg-white border-gray-200"
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={`px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
        Type
      </div>
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search type…"
          className={`w-full h-8 px-2.5 rounded-md text-xs outline-none border ${
            darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400"
          }`}
        />
      </div>
      <div className="py-1 max-h-56 overflow-y-auto">
        {filtered.length === 0 && (
          <div className={`px-3 py-4 text-xs text-center ${darkMode ? "text-gray-500" : "text-gray-400"}`}>No matches</div>
        )}
        {filtered.map((t) => {
          const isCurrent = t.id === currentTypeId;
          return (
            <div
              key={t.id}
              onClick={() => onSelect?.(t.id)}
              className={`mx-2 my-0.5 px-2.5 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 rounded-lg transition-colors ${
                isCurrent
                  ? darkMode
                    ? "bg-blue-500/20 text-white"
                    : "bg-blue-50 text-blue-700"
                  : darkMode
                  ? "hover:bg-[#0f1224] text-gray-200"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              <div className="w-3.5 h-3.5 rounded-sm shrink-0 ring-1 ring-white/20" style={{ backgroundColor: t.color }}></div>
              <span className="flex-1">{t.label}</span>
              {isCurrent && <Check size={12} className="opacity-70" />}
            </div>
          );
        })}
      </div>
      <div className={`px-3 py-3 border-t ${darkMode ? "border-[#2b2c32]" : "border-gray-100"}`}>
        <div className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
          Add Label
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
            }}
            placeholder="New type…"
            className={`flex-1 h-8 px-2.5 rounded-md text-xs outline-none border ${
              darkMode ? "bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500" : "bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400"
            }`}
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
          />
        </div>
        <button
          onClick={commitAdd}
          className={`mt-2 w-full h-8 rounded-md text-xs font-semibold transition-colors ${
            darkMode ? "bg-blue-600/90 hover:bg-blue-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
          type="button"
        >
          Add Type
        </button>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
        className={`w-full px-4 py-2.5 text-[11px] font-semibold border-t flex items-center gap-2 transition-colors ${
          darkMode ? "border-[#2b2c32] text-blue-300 hover:bg-[#0f1224]" : "border-gray-100 text-blue-600 hover:bg-gray-50"
        }`}
        type="button"
      >
        <Edit2 size={12} /> Manage Type Labels
      </button>
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
  onEditStatusLabels,
  onEditTypeLabels,
  onAddStatusLabel,
  onAddTypeLabel,
  boardColumns,
  onOpenUpdates,
  reorderDrag,
  canEdit = true,
}) {
  const dragBlockRef = useRef(false);
  const hasSubitems = task.subitems && task.subitems.length > 0;

  const statusColor = statuses.find((s) => s.id === task.status)?.color || "#c4c4c4";
  const statusLabel = statuses.find((s) => s.id === task.status)?.label || "Status";

  const typeColor = jobTypes.find((t) => t.id === task.jobTypeId)?.color || "#c4c4c4";
  const typeLabel = jobTypes.find((t) => t.id === task.jobTypeId)?.label || "Type";

  const normalizedStart = normalizeDateKey(task.start);
  const hasDates = Boolean(normalizedStart);
  const safeDuration = Math.max(1, Number(task.duration || 1));
  const endKey = hasDates ? addDaysToKey(normalizedStart, safeDuration - 1) : null;
  const showRange = hasDates && safeDuration > 1;
  const boardCol = activeTab === "board" ? (boardColumns || {
    select: 40,
    item: 450,
    person: 112,
    status: 144,
    type: 144,
    date: 192,
  }) : {
    select: 40,
    item: 450,
    person: 112,
    status: 144,
    type: 144,
    date: 192,
  };

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
      draggable={canEdit}
      onClick={(e) => {
        if (dragBlockRef.current) return;
        const target = e.target;
        const isInteractive =
          ["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(target.tagName) ||
          target.closest(".no-drag") ||
          target.getAttribute("contenteditable") === "true";
        if (isInteractive) return;
        if (onOpenUpdates) {
          onOpenUpdates(projectId, isSubitem ? parentId : task.id, isSubitem ? task.id : null);
        }
      }}
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
        if (!canEdit) {
          e.preventDefault();
          return;
        }
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
        if (onDragStart) onDragStart(e, isSubitem ? "subitem" : "task", task.id, projectId);
      }}
      onDragOver={onDragOver}
      onDrop={(e) => {
        if (onDrop) onDrop(e, isSubitem ? "subitem" : "task", task.id, projectId);
      }}
      onDragEnd={onDragEnd}
    >
      <div
        className={`border-r h-full flex items-center justify-center relative no-drag min-w-0 ${
          darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"
        }`}
        style={{ width: boardCol.select }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`cursor-pointer transition-all duration-200 ${
            isSelected ? "text-blue-500 opacity-100" : "text-gray-400 opacity-50 group-hover:opacity-100 hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (!canEdit) return;
            onToggle(task.id, projectId);
          }}
        >
          {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        </div>
      </div>

      <div
        className={`border-r h-full flex items-center px-4 relative min-w-0 ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}
        style={{ width: boardCol.item }}
      >
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
            onChange={
              canEdit
                ? (e) =>
                    isSubitem
                      ? updateSubitemName(projectId, parentId, task.id, e.target.value)
                      : updateTaskName(projectId, task.id, e.target.value)
                : undefined
            }
            readOnly={!canEdit}
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
                  if (!canEdit) return;
                  onAddSubitem(projectId, task.id);
                }}
                className={`p-1 rounded transition-colors ${
                  canEdit ? "hover:bg-gray-200 text-gray-400 hover:text-blue-600" : "text-gray-500/60 cursor-not-allowed"
                }`}
                disabled={!canEdit}
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === "board" && (
        <>
          <div
            className={`border-r h-full flex items-center justify-center min-w-0 ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}
            style={{ width: boardCol.person }}
          >
            <div className="w-6 h-6 rounded-full bg-gray-400 text-[10px] flex items-center justify-center text-white border-2 border-transparent shadow-sm">
              {task.assignee?.charAt(0)}
            </div>
          </div>

          <div
            className={`border-r h-full flex items-center justify-center px-2 relative min-w-0 ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}
            style={{ width: boardCol.status }}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit) return;
                setStatusMenuOpen(task.id);
                setStatusMenuType("status");
              }}
              className={`w-full h-8 flex items-center justify-center text-xs font-medium text-white rounded-sm overflow-hidden ${
                canEdit ? "cursor-pointer transition hover:opacity-90" : "cursor-default opacity-90"
              }`}
              style={{ backgroundColor: statusColor }}
            >
              <span className="truncate w-full text-center px-2">{statusLabel}</span>
            </div>

            {canEdit && statusMenuOpen === task.id && statusMenuType === "status" && (
              <div className="absolute top-full w-full left-0 z-[100]">
                <StatusDropdown
                  statuses={statuses}
                  currentStatusId={task.status}
                  onSelect={(id) => onStatusSelect(projectId, task.id, isSubitem ? task.id : null, id)}
                  darkMode={darkMode}
                  onEdit={onEditStatusLabels}
                  onAddLabel={onAddStatusLabel}
                />
              </div>
            )}
          </div>

          <div
            className={`border-r h-full flex items-center justify-center px-2 relative min-w-0 ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}
            style={{ width: boardCol.type }}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!canEdit) return;
                setStatusMenuOpen(task.id);
                setStatusMenuType("type");
              }}
              className={`w-full h-8 flex items-center justify-center text-xs font-medium text-white rounded-sm overflow-hidden ${
                canEdit ? "cursor-pointer transition hover:opacity-90" : "cursor-default opacity-90"
              }`}
              style={{ backgroundColor: typeColor }}
            >
              <span className="truncate w-full text-center px-2">{typeLabel}</span>
            </div>

            {canEdit && statusMenuOpen === task.id && statusMenuType === "type" && (
              <div className="absolute top-full w-full left-0 z-[100]">
                <TypeDropdown
                  jobTypes={jobTypes}
                  currentTypeId={task.jobTypeId}
                  onSelect={(id) => onTypeSelect(projectId, task.id, isSubitem ? task.id : null, id)}
                  darkMode={darkMode}
                  onEdit={onEditTypeLabels}
                  onAddLabel={onAddTypeLabel}
                />
              </div>
            )}
          </div>

          <div
            className={`h-full flex items-center justify-center px-4 relative min-w-0 ${
              canEdit ? "cursor-pointer" : "cursor-default"
            } ${darkMode ? "hover:bg-white/5" : ""}`}
            style={{ width: boardCol.date }}
            onClick={(e) => {
              e.stopPropagation();
              if (!canEdit) return;
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
              <span className={`text-xs truncate text-center ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                {formatDateKey(normalizedStart)}
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
