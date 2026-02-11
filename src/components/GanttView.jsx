import React from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";

import TaskRow from "./TaskRow";

const GanttView = (props) => {
  const {
    visibleProjects,
    collapsedGroups,
    toggleGroupCollapse,
    darkMode,
    rowHeight,
    visibleDays,
    visibleMonths,
    zoomLevel,
    dayToVisualIndex,
    showWeekends,
    showLabels,
    statuses,
    jobTypes,
    colorBy,
    dragState,
    handleMouseDown,
    handleRowDragStart,
    handleRowDragOver,
    handleRowDrop,
    handleRowDragEnd,
    handleGroupDragOver,
    handleGroupDrop,
    getRelativeIndex,
    hiddenWeekendHeaderMarkers = {},
    hiddenWeekendItemMarkers = {},
    reorderDrag,
    selectedItems,
    toggleSelection,
    handleAddSubitem,
    updateTaskName,
    addTaskToGroup,
    expandedItems,
    toggleItemExpand,
    updateSubitemName,

    // ✅ ADD THESE (with safe defaults)
    statusMenuOpen = null,
    statusMenuType = null,

    // existing setters / handlers
    setStatusMenuOpen,
    setStatusMenuType,
    setDatePickerOpen,
    onStatusSelect,
    onTypeSelect,
    onEditStatusLabels,
    onEditTypeLabels,
    onAddStatusLabel,
    onAddTypeLabel,
    onOpenUpdates,
    canEditProject,
  } = props;

  const SHOW_ADD_ITEM_ROW = false;

  const getTaskColor = (task) => {
    if (colorBy === "status") {
      return statuses.find((s) => s.id === task.status)?.color || "#c4c4c4";
    }
    return jobTypes.find((t) => t.id === task.jobTypeId)?.color || "#c4c4c4";
  };

  const getHeaderMarkerStyle = (isActive) => {
    if (!isActive) return null;
    return {
      background: "#3b82f6",
      boxShadow: "0 0 8px rgba(59,130,246,0.9), 0 0 16px rgba(59,130,246,0.6)",
      transform: "translateX(-50%)",
    };
  };

  const getRowMarkerStyle = (marker) => {
    if (!marker || !marker.color) return null;
    const gapVisual = dayToVisualIndex?.[marker.gapAt];
    if (gapVisual === undefined || gapVisual === null) return null;
    const width = Math.max(3, Math.round(zoomLevel * 0.2));
    let left = gapVisual * zoomLevel;
    if (marker.side === "left") left -= width;
    else if (marker.side === "center") left -= width / 2;
    left = Math.max(0, left);
    return {
      left: `${left}px`,
      width: `${width}px`,
      background: marker.color,
      boxShadow: `0 0 10px ${marker.color}`,
    };
  };

  const getWeekendMarkerFrameStyle = () => ({
    height: "70%",
    top: "50%",
    transform: "translateY(-50%)",
    border: darkMode ? "1px solid rgba(10,12,24,0.65)" : "1px solid rgba(255,255,255,0.75)",
  });

  return (
    <div
      ref={props.bodyRef}
      className={`flex-1 overflow-auto overflow-x-auto relative border-t ${
        darkMode ? "bg-[#181b34] border-[#2b2c32]" : "bg-white border-[#d0d4e4]"
      }`}
    >
      <div
        className={`flex border-b sticky top-0 z-40 shadow-sm ${
          darkMode ? "bg-[#181b34] border-[#2b2c32]" : "bg-white border-[#d0d4e4]"
        }`}
        style={{ width: `calc(20rem + ${visibleDays.length * zoomLevel}px)` }}
      >
        <div
          className={`w-80 border-r p-3 font-medium text-sm pl-6 sticky left-0 z-[200] flex-shrink-0 ${
            darkMode
              ? "bg-[#1c213e] border-[#2b2c32] text-gray-300"
              : "bg-[#f9fafc] border-[#d0d4e4] text-gray-500"
          }`}
        >
          Board / Item
        </div>
        <div className="flex flex-col flex-1">
          <div className={`flex h-8 border-b ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}>
            {visibleMonths.map((month, i) => (
              <div
                key={i}
                className="flex-shrink-0 border-r flex items-center justify-center text-xs font-bold uppercase tracking-wide text-gray-400"
                style={{
                  width: `${month.count * zoomLevel}px`,
                  background: darkMode
                    ? "linear-gradient(to right, #2b304a, #181b34)"
                    : "linear-gradient(to right, #f9fafc, #e2e8f0)",
                }}
              >
                {month.name}
              </div>
            ))}
          </div>
          <div className="flex h-10">
            {visibleDays.map((day, i) => {
              const showWeekRange = zoomLevel < 20 && (day.isMonday || i === 0);
              const headerMarkerStyle = getHeaderMarkerStyle(hiddenWeekendHeaderMarkers?.[day.index]);
              return (
                <div
                  key={i}
                  className={`flex-shrink-0 border-r flex flex-col items-center justify-center text-gray-400 relative ${
                    darkMode
                      ? "border-white/5 " + (day.isWeekend ? "bg-[#151726]" : "bg-[#181b34]")
                      : "border-[#eceff8] " + (day.isWeekend ? "bg-slate-50" : "bg-white")
                  } ${
                    !showWeekends && i > 0 && day.index > visibleDays[i - 1].index + 1
                      ? darkMode
                        ? "border-l-2 border-l-[#3e3f4b]"
                        : "border-l-2 border-l-gray-300"
                      : ""
                  } ${day.isToday ? "bg-blue-600 text-white" : ""}`}
                  style={{ width: `${zoomLevel}px` }}
                >
                  {headerMarkerStyle && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px] pointer-events-none z-20 rounded-r-sm"
                      style={headerMarkerStyle}
                    />
                  )}
                  {showWeekRange && (
                    <div className="absolute top-0 left-0 w-max pl-1 text-[10px] font-bold whitespace-nowrap z-10 pointer-events-none opacity-50">
                      {day.weekLabel}
                    </div>
                  )}
                  {zoomLevel >= 20 && (
                    <span
                      className={`font-semibold leading-none ${day.isToday ? "text-white" : ""}`}
                      style={{ fontSize: `${Math.max(10, Math.min(14, zoomLevel * 0.4))}px` }}
                    >
                      {day.dayNum}
                    </span>
                  )}
                  {zoomLevel >= 40 && <span className="text-[9px] mt-0.5 opacity-60">{day.dayName.charAt(0)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ width: `calc(20rem + ${visibleDays.length * zoomLevel}px)` }}>
        {visibleProjects.map((project) => {
          const canEdit = canEditProject ? canEditProject(project.id) : true;
          const projectGroups = project.groups || [{ id: "default", name: "Main Group", color: "#579bfc" }];
          return (
            <div
              key={project.id}
              className={`border-b group/project ${darkMode ? "border-[#2b2c32] bg-[#181b34]" : "border-[#eceff8] bg-white"}`}
            >
              <div
                className={`flex border-b ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}
                style={{ height: `${Math.max(34, rowHeight - 2)}px` }}
              >
                <div
                  className={`w-80 border-r px-4 sticky left-0 z-[200] flex items-center gap-2 flex-shrink-0 ${
                    darkMode ? "border-[#2b2c32] bg-[#151726] text-gray-200" : "border-[#d0d4e4] bg-[#f9fafc] text-gray-800"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide opacity-60">Board</span>
                  <span className="text-sm font-semibold truncate">{project.name || "Untitled Board"}</span>
                </div>
                <div className={`flex-1 ${darkMode ? "bg-[#151726]" : "bg-[#f9fafc]"}`} />
              </div>
              {projectGroups.map((group) => {
                const groupTasks = project.tasks.filter(
                  (t) => t.groupId === group.id || (!t.groupId && group.id === "default")
                );
                const isGroupCollapsed = collapsedGroups.includes(group.id);
                const isGroupDropTarget =
                  reorderDrag.active &&
                  reorderDrag.dropTargetType === "group" &&
                  reorderDrag.dropTargetId === group.id &&
                  reorderDrag.dropTargetProjectId === project.id;
                return (
                  <div key={group.id}>
                    <div
                      className={`flex relative transition-colors duration-200 ${
                        isGroupDropTarget ? (darkMode ? "ring-2 ring-blue-500/60" : "ring-2 ring-blue-300") : ""
                      }`}
                      style={{ height: `${rowHeight}px`, backgroundColor: group.color + (darkMode ? "33" : "1A") }}
                      onDragOver={(e) => handleGroupDragOver(e, project.id, group.id)}
                      onDrop={(e) => handleGroupDrop(e, project.id, group.id)}
                    >
                      <div
                        className={`w-80 border-r px-4 flex items-center gap-2 sticky left-0 z-[200] cursor-pointer flex-shrink-0 transition-colors ${
                          darkMode ? "border-[#2b2c32] text-gray-200" : "border-[#d0d4e4] text-gray-700"
                        }`}
                        onClick={() => toggleGroupCollapse(group.id)}
                        style={{
                          background: `linear-gradient(${group.color}${darkMode ? "33" : "1A"}, ${group.color}${
                            darkMode ? "33" : "1A"
                          }), ${darkMode ? "#181b34" : "#ffffff"}`,
                        }}
                      >
                        <div className={`p-1 rounded transition ${isGroupCollapsed ? "-rotate-90" : "rotate-0"}`}>
                          <ChevronDown size={16} style={{ color: group.color }} />
                        </div>
                        <span className="font-bold text-sm" style={{ color: group.color }}>
                          {group.name}
                        </span>
                        <span className="text-xs opacity-50 ml-2 font-normal">({groupTasks.length})</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canEdit) return;
                            addTaskToGroup(project.id, group.id, "New Item");
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          aria-label="Add item"
                          disabled={!canEdit}
                          className={`ml-auto p-1 rounded transition-colors ${
                            !canEdit
                              ? "text-gray-400/60 cursor-not-allowed"
                              : darkMode
                              ? "text-gray-200 hover:bg-white/10"
                              : "text-gray-600 hover:bg-black/5"
                          }`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                        <div className="relative flex-1 h-full">
                          <div className="absolute inset-0 flex pointer-events-none z-0">
                          {props.visibleDays.map((day, i) => (
                            <div
                              key={i}
                              className={`h-full border-r relative ${
                                darkMode ? "border-white/5" : "border-[#eceff8]"
                              } ${day.isWeekend ? "bg-black/20" : "bg-transparent"} ${
                                day.isToday ? "bg-blue-500/10" : ""
                              } ${
                                !props.showWeekends && i > 0 && day.index > props.visibleDays[i - 1].index + 1
                                  ? darkMode
                                    ? "border-l-2 border-l-[#3e3f4b]"
                                    : "border-l-2 border-l-gray-300"
                                  : ""
                              }`}
                              style={{ width: `${zoomLevel}px`, minWidth: `${zoomLevel}px` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {!isGroupCollapsed &&
                      groupTasks.map((task) => {
                        const isExpanded = expandedItems.includes(task.id);
                        const hasSubitems = task.subitems && task.subitems.length > 0;
                        const hasRenderableSubitems = (task.subitems || []).some((sub) => {
                          const idx = getRelativeIndex(sub.start);
                          return idx !== null && idx !== undefined;
                        });
                        const isDragging = reorderDrag.active && reorderDrag.dragId === task.id;
                        const isDeleting = dragState.isDeleteMode && dragState.taskId === task.id && !dragState.subitemId;
                        const taskStartIndex = getRelativeIndex(task.start);
                        const taskDuration = Math.max(1, Number(task.duration || 1));
                        const rowMarker = hiddenWeekendItemMarkers?.[task.id];
                        const rowMarkerStyle = getRowMarkerStyle(rowMarker);

                        const taskRowProps = {
                          task,
                          projectId: project.id,
                          isSubitem: false,
                          isDragging,
                          onDragStart: (e) => canEdit && handleRowDragStart(e, "task", task.id, project.id),
                          canEdit,
                          onDragOver: (e) => handleRowDragOver(e, "task", task.id),
                          onDrop: handleRowDrop,
                          onDragEnd: handleRowDragEnd,
                          isSelected: selectedItems.has(task.id),
                          onToggle: toggleSelection,
                          onAddSubitem: handleAddSubitem,
                          activeTab: "gantt",
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
                          onEditStatusLabels: () => onEditStatusLabels?.(project.id),
                          onEditTypeLabels: () => onEditTypeLabels?.(project.id),
                          onAddStatusLabel: (label, color) => onAddStatusLabel?.(project.id, label, color),
                          onAddTypeLabel: (label, color) => onAddTypeLabel?.(project.id, label, color),
                          onOpenUpdates,
                          reorderDrag,
                        };

                        const parentRowSegments = (() => {
                          if (!hasSubitems || isExpanded) return null;
                          const validItems = task.subitems
                            .map((sub) => {
                              if (sub.start === null) return null;
                              const subStartIndex = getRelativeIndex(sub.start);
                              if (subStartIndex === null || subStartIndex === undefined) return null;
                              const start = dayToVisualIndex[subStartIndex];
                              const safeDuration = Math.max(1, Number(sub.duration || 1));
                              const endDayIndex = subStartIndex + safeDuration;
                              let end = dayToVisualIndex[endDayIndex];
                              if (end === undefined) end = visibleDays.length;
                              if (start === undefined) return null;
                              const color = getTaskColor(sub);
                              return {
                                start,
                                end,
                                color,
                                id: sub.id,
                                name: sub.name,
                                originalObj: sub,
                                duration: safeDuration,
                              };
                            })
                            .filter(Boolean);
                          if (validItems.length === 0) return null;
                          validItems.sort((a, b) => a.start - b.start);
                          const lanes = [];
                          const layout = validItems.map((item) => {
                            let laneIndex = -1;
                            for (let l = 0; l < lanes.length; l++) {
                              if (lanes[l] <= item.start) {
                                laneIndex = l;
                                break;
                              }
                            }
                            if (laneIndex === -1) {
                              laneIndex = lanes.length;
                              lanes.push(item.end);
                            } else {
                              lanes[laneIndex] = item.end;
                            }
                            return { ...item, laneIndex };
                          });
                          return { items: layout, maxLanes: lanes.length };
                        })();

                        return (
                          <React.Fragment key={task.id}>
                            <div
                              className={`flex border-b relative group/task ${
                                isExpanded
                                  ? darkMode
                                    ? "bg-[#151726]"
                                    : "bg-gray-100"
                                  : darkMode
                                  ? "bg-[#181b34] hover:bg-[#202336]"
                                  : "bg-white hover:bg-[#f9fafc]"
                              } ${darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"}`}
                              style={{ height: `${rowHeight}px` }}
                            >
                              <div
                                className={`w-80 border-r flex-shrink-0 sticky left-0 z-[200] ${
                                  darkMode
                                    ? "border-[#2b2c32] bg-inherit text-gray-300"
                                    : "border-[#d0d4e4] bg-inherit text-gray-800"
                                }`}
                                style={{ opacity: isDragging ? 0.5 : 1, transition: "opacity 0.2s" }}
                              >
                                <TaskRow {...taskRowProps} />
                              </div>

                              <div
                                className="relative flex-1 h-full"
                                onMouseDown={(e) => {
                                  if (!canEdit) return;
                                  handleMouseDown(e, task, project.id, "create", null, "parent");
                                }}
                              >
                                <div className="absolute inset-0 flex pointer-events-none z-0">
                                  {visibleDays.map((day, i) => (
                                    <div
                                      key={i}
                                      className={`h-full border-r relative ${
                                        darkMode ? "border-white/5" : "border-[#eceff8]"
                                      } ${day.isWeekend ? "bg-black/20" : "bg-transparent"} ${
                                        !showWeekends && i > 0 && day.index > visibleDays[i - 1].index + 1
                                          ? darkMode
                                            ? "border-l-2 border-l-[#3e3f4b]"
                                            : "border-l-2 border-l-gray-300"
                                          : ""
                                      } ${day.isToday ? "bg-blue-500/10" : ""}`}
                                      style={{ width: `${zoomLevel}px`, minWidth: `${zoomLevel}px` }}
                                    ></div>
                                  ))}
                                </div>
                                {rowMarkerStyle && (
                                  <div
                                    className="absolute pointer-events-none z-10 rounded-md"
                                    style={{ ...rowMarkerStyle, ...getWeekendMarkerFrameStyle() }}
                                  />
                                )}
                                {dragState.type === "create" &&
                                  dragState.taskId === task.id &&
                                  !dragState.subitemId && (
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 h-2/3 rounded-md shadow-sm border-2 border-dashed border-blue-400 bg-blue-400/20 z-10 pointer-events-none"
                                      style={{
                                        left: `${dayToVisualIndex[dragState.originalStart] * zoomLevel}px`,
                                        width: `${dragState.currentSpan * zoomLevel}px`,
                                      }}
                                    />
                                  )}
                                {dragState.isDeleteMode &&
                                  dragState.taskId === task.id &&
                                  dragState.origin === "parent" && (
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 h-2/3 flex items-center justify-center z-50 pointer-events-none"
                                      style={{
                                        left: `${dragState.currentVisualSlot * zoomLevel}px`,
                                        width: `${zoomLevel}px`,
                                      }}
                                    >
                                      <div className="bg-red-500 text-white p-1 rounded shadow-lg scale-75 animate-pulse">
                                        <Trash2 size={12} />
                                      </div>
                                    </div>
                                  )}

                                {hasSubitems &&
                                  !isExpanded &&
                                  parentRowSegments &&
                                  parentRowSegments.items.map((item) => (
                                    <div
                                      key={item.id}
                                      className={`absolute h-3/4 rounded-md shadow-sm z-20 flex items-center border overflow-hidden ${
                                        darkMode ? "border-[#181b34]" : "border-white"
                                      }`}
                                      style={{
                                        left: `${item.start * zoomLevel}px`,
                                        width: `${Math.max((item.end - item.start) * zoomLevel, 0)}px`,
                                        backgroundColor: item.color,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        marginTop: `${item.laneIndex * 6 - (parentRowSegments.maxLanes - 1) * 3}px`,
                                        zIndex: 20 + item.laneIndex,
                                        cursor: "move",
                                      }}
                                      onMouseDown={(e) => {
                                        if (!canEdit) return;
                                        handleMouseDown(e, task, project.id, "move", item.id, "parent");
                                      }}
                                    >
                                      <div
                                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 z-30"
                                        onMouseDown={(e) => {
                                          if (!canEdit) return;
                                          handleMouseDown(e, task, project.id, "resize-left", item.id, "parent");
                                        }}
                                      ></div>
                                      <div
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 z-30"
                                        onMouseDown={(e) => {
                                          if (!canEdit) return;
                                          handleMouseDown(e, task, project.id, "resize-right", item.id, "parent");
                                        }}
                                      ></div>
                                      {zoomLevel > 15 && showLabels && (
                                        <span className="truncate select-none pointer-events-none font-medium text-[9px] text-white pl-2 pr-1 block w-full text-left">
                                          {item.name}
                                        </span>
                                      )}
                                    </div>
                                  ))}

                                {task.start !== null &&
                                  taskStartIndex !== null &&
                                  taskStartIndex !== undefined &&
                                  !hasRenderableSubitems &&
                                  !isDeleting && (
                                  (() => {
                                    const startVisual = dayToVisualIndex[taskStartIndex];
                                    if (startVisual === undefined || startVisual === null) return null;
                                    const endVisual =
                                      dayToVisualIndex[taskStartIndex + taskDuration] ?? visibleDays.length;
                                    const barWidth = Math.max((endVisual - startVisual) * zoomLevel, zoomLevel);
                                    return (
                                  <div
                                    className={`absolute top-1/2 -translate-y-1/2 h-3/4 rounded-md shadow-sm flex items-center px-0 text-[9px] cursor-move group z-10 border overflow-hidden ${
                                      darkMode ? "border-[#181b34]" : "border-white"
                                    }`}
                                    style={{
                                      left: `${startVisual * zoomLevel}px`,
                                      width: `${barWidth}px`,
                                      backgroundColor: getTaskColor(task),
                                    }}
                                    onMouseDown={(e) => {
                                      if (!canEdit) return;
                                      handleMouseDown(e, task, project.id, "move", null, "parent");
                                    }}
                                  >
                                    {zoomLevel > 15 && showLabels && (
                                      <span className="truncate select-none pointer-events-none font-medium block w-full text-white text-left pl-2 pr-1">
                                        {task.name}
                                      </span>
                                    )}
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/10 rounded-l-md"
                                      onMouseDown={(e) => {
                                        if (!canEdit) return;
                                        handleMouseDown(e, task, project.id, "resize-left", null, "parent");
                                      }}
                                    ></div>
                                    <div
                                      className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-black/10 rounded-r-md"
                                      onMouseDown={(e) => {
                                        if (!canEdit) return;
                                        handleMouseDown(e, task, project.id, "resize-right", null, "parent");
                                      }}
                                    ></div>
                                  </div>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                            {isExpanded &&
                              task.subitems.map((sub) => {
                                const isSubDragging = reorderDrag.active && reorderDrag.dragId === sub.id;
                                const isSubDeleting = dragState.isDeleteMode && dragState.subitemId === sub.id;
                                const subStartIndex = getRelativeIndex(sub.start);
                                const subDuration = Math.max(1, Number(sub.duration || 1));
                                const subRowMarker = hiddenWeekendItemMarkers?.[sub.id];
                                const subRowMarkerStyle = getRowMarkerStyle(subRowMarker);
                                const subRowProps = {
                                  ...taskRowProps,
                                  task: sub,
                                  parentId: task.id,
                                  isSubitem: true,
                                  isDragging: isSubDragging,
                                  onDragStart: (e) => canEdit && handleRowDragStart(e, "subitem", sub.id, project.id),
                                  canEdit,
                                  onDragOver: (e) => handleRowDragOver(e, "subitem", sub.id),
                                };

                                return (
                                  <div
                                    key={sub.id}
                                    className={`flex h-10 items-center border-t relative ${
                                      darkMode ? "border-[#2b2c32] hover:bg-[#202336]" : "border-[#eceff8] hover:bg-[#eceff8]"
                                    }`}
                                  >
                                    <div
                                      className={`w-80 border-r flex-shrink-0 sticky left-0 z-[200] ${
                                        darkMode
                                          ? "border-[#2b2c32] bg-inherit text-gray-400"
                                          : "border-[#d0d4e4] bg-inherit text-gray-500"
                                      }`}
                                      style={{ opacity: isSubDragging ? 0.5 : 1, transition: "opacity 0.2s" }}
                                    >
                                      <TaskRow {...subRowProps} />
                                    </div>
                                    <div
                                      className="relative flex-1 h-full"
                                      onMouseDown={(e) => {
                                        if (!canEdit) return;
                                        handleMouseDown(e, task, project.id, "create", sub.id, "expanded");
                                      }}
                                    >
                                      <div className="absolute inset-0 flex pointer-events-none z-0">
                                        {visibleDays.map((day, i) => (
                                          <div
                                            key={i}
                                            className={`h-full border-r relative ${
                                              darkMode ? "border-white/5" : "border-[#eceff8]"
                                            } ${day.isWeekend ? "bg-black/20" : "bg-transparent"} ${
                                              !showWeekends && i > 0 && day.index > visibleDays[i - 1].index + 1
                                                ? darkMode
                                                  ? "border-l-2 border-l-[#3e3f4b]"
                                                  : "border-l-2 border-l-gray-300"
                                                : ""
                                            } ${day.isToday ? "bg-blue-500/10" : ""}`}
                                            style={{ width: `${zoomLevel}px`, minWidth: `${zoomLevel}px` }}
                                          ></div>
                                        ))}
                                      </div>
                                      {subRowMarkerStyle && (
                                        <div
                                          className="absolute pointer-events-none z-10 rounded-md"
                                          style={{ ...subRowMarkerStyle, ...getWeekendMarkerFrameStyle() }}
                                        />
                                      )}
                                      {dragState.type === "create" && dragState.subitemId === sub.id && (
                                        <div
                                          className="absolute top-1/2 -translate-y-1/2 h-2/3 rounded-md shadow-sm border-2 border-dashed border-blue-400 bg-blue-400/20 z-10 pointer-events-none"
                                          style={{
                                            left: `${dayToVisualIndex[dragState.originalStart] * zoomLevel}px`,
                                            width: `${dragState.currentSpan * zoomLevel}px`,
                                          }}
                                        />
                                      )}
                                      {dragState.isDeleteMode &&
                                        dragState.subitemId === sub.id &&
                                        dragState.origin === "expanded" && (
                                          <div
                                            className="absolute top-1/2 -translate-y-1/2 h-2/3 flex items-center justify-center z-50 pointer-events-none"
                                            style={{
                                              left: `${dragState.currentVisualSlot * zoomLevel}px`,
                                              width: `${zoomLevel}px`,
                                            }}
                                          >
                                            <div className="bg-red-500 text-white p-1 rounded shadow-lg scale-75 animate-pulse">
                                              <Trash2 size={12} />
                                            </div>
                                          </div>
                                        )}
                                      {sub.start !== null &&
                                        subStartIndex !== null &&
                                        subStartIndex !== undefined &&
                                        !isSubDeleting && (() => {
                                          const startVisual = dayToVisualIndex[subStartIndex];
                                          if (startVisual === undefined || startVisual === null) return null;
                                          const endVisual =
                                            dayToVisualIndex[subStartIndex + subDuration] ?? visibleDays.length;
                                          const barWidth = Math.max((endVisual - startVisual) * zoomLevel, zoomLevel);
                                          return (
                                        <div
                                          className={`absolute top-1/2 -translate-y-1/2 h-3/4 rounded-md shadow-sm z-10 border overflow-hidden flex items-center ${
                                            darkMode ? "border-[#181b34]" : "border-white"
                                          }`}
                                          style={{
                                            left: `${startVisual * zoomLevel}px`,
                                            width: `${barWidth}px`,
                                            backgroundColor: getTaskColor(sub),
                                          }}
                                          onMouseDown={(e) => {
                                            if (!canEdit) return;
                                            handleMouseDown(e, task, project.id, "move", sub.id, "expanded");
                                          }}
                                        >
                                          {zoomLevel > 15 && showLabels && (
                                            <span className="truncate select-none pointer-events-none font-medium text-[9px] text-white pl-2 pr-1 block w-full text-left">
                                              {sub.name}
                                            </span>
                                          )}
                                          <div
                                            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 rounded-l-sm z-30"
                                            onMouseDown={(e) =>
                                              canEdit && handleMouseDown(e, task, project.id, "resize-left", sub.id, "expanded")
                                            }
                                          ></div>
                                          <div
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-black/20 rounded-r-sm z-30"
                                            onMouseDown={(e) =>
                                              canEdit && handleMouseDown(e, task, project.id, "resize-right", sub.id, "expanded")
                                            }
                                          ></div>
                                        </div>
                                          );
                                        })()}
                                    </div>
                                  </div>
                                );
                              })}
                          </React.Fragment>
                        );
                      })}
                    {SHOW_ADD_ITEM_ROW && !isGroupCollapsed && (
                      <div
                        className={`flex border-b relative ${
                          darkMode ? "border-[#2b2c32]" : "border-[#eceff8]"
                        }`}
                        style={{ height: `${rowHeight}px` }}
                      >
                        <div
                          className={`w-80 border-r flex-shrink-0 sticky left-0 z-[200] flex items-center px-4 ${
                            darkMode ? "border-[#2b2c32] bg-[#181b34]" : "border-[#d0d4e4] bg-white"
                          }`}
                        >
                          <div className="w-10 flex justify-center mr-2 opacity-50">
                            <Plus size={14} />
                          </div>
                          <input
                            type="text"
                            placeholder="+ Add Item"
                            disabled={!canEdit}
                            className={`bg-transparent outline-none text-sm w-full ${
                              !canEdit
                                ? darkMode ? "text-gray-600 placeholder-gray-700" : "text-gray-400 placeholder-gray-400"
                                : darkMode ? "text-gray-400 placeholder-gray-600" : "text-gray-500 placeholder-gray-400"
                            }`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && e.target.value.trim()) {
                                if (!canEdit) return;
                                addTaskToGroup(project.id, group.id, e.target.value);
                                e.target.value = "";
                              }
                            }}
                          />
                        </div>
                        <div className="relative flex-1 h-full">
                          <div className="absolute inset-0 flex pointer-events-none z-0">
                            {visibleDays.map((day, i) => (
                              <div
                                key={i}
                                className={`h-full border-r relative ${
                                  darkMode ? "border-white/5" : "border-[#eceff8]"
                                } ${day.isWeekend ? "bg-black/20" : "bg-transparent"} ${
                                  !showWeekends && i > 0 && day.index > visibleDays[i - 1].index + 1
                                    ? darkMode
                                      ? "border-l-2 border-l-[#3e3f4b]"
                                      : "border-l-2 border-l-gray-300"
                                    : ""
                                } ${day.isToday ? "bg-blue-500/10" : ""}`}
                                style={{ width: `${zoomLevel}px`, minWidth: `${zoomLevel}px` }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttView;
