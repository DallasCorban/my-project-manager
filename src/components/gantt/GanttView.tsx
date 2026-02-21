// GanttView — main Gantt chart container.
// Renders timeline header, group sections, task rows with bars.
// Ported from GanttView.jsx (778 lines) + App.jsx drag handlers.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, ZoomIn, ZoomOut, CalendarDays, Eye } from 'lucide-react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTimeline } from '../../hooks/useTimeline';
import { useGanttDrag } from '../../hooks/useGanttDrag';
import { useScrollToToday } from '../../hooks/useScrollToToday';
import { useSortableSensors } from '../../hooks/useSmartSensors';
import { GanttHeader } from './GanttHeader';
import { GanttTaskRow } from './GanttTaskRow';
import type { Board, Group } from '../../types/board';
import type { Item, Subitem } from '../../types/item';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';

interface GanttViewProps {
  project: Board;
  statuses: StatusLabel[];
  jobTypes: JobTypeLabel[];
  canEdit: boolean;
  onUpdateTaskDate: (
    pid: string,
    tid: string,
    sid: string | null,
    start: string | null,
    duration: number | null,
  ) => void;
  onUpdateTaskName: (pid: string, tid: string, value: string) => void;
  onUpdateSubitemName: (pid: string, tid: string, sid: string, value: string) => void;
  onChangeStatus: (pid: string, tid: string, sid: string | null, val: string) => void;
  onChangeJobType: (pid: string, tid: string, sid: string | null, val: string) => void;
  onAddTaskToGroup: (pid: string, gid: string) => void;
  onAddSubitem?: (pid: string, tid: string, name?: string) => void;
}

export function GanttView({
  project,
  statuses,
  jobTypes,
  canEdit,
  onUpdateTaskDate,
  onUpdateTaskName,
  onUpdateSubitemName,
  onChangeStatus,
  onChangeJobType,
  onAddTaskToGroup,
  onAddSubitem,
}: GanttViewProps) {
  const { reorderTasks, moveTaskToGroup, reorderSubitems } = useProjectContext();

  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const toggleGroupCollapse = useUIStore((s) => s.toggleGroupCollapse);
  const expandedItems = useUIStore((s) => s.expandedItems);

  const showWeekends = useTimelineStore((s) => s.showWeekends);
  const toggleWeekends = useTimelineStore((s) => s.toggleWeekends);
  const showLabels = useTimelineStore((s) => s.showLabels);
  const setShowLabels = useTimelineStore((s) => s.setShowLabels);
  const colorBy = useTimelineStore((s) => s.colorBy);
  const setColorBy = useTimelineStore((s) => s.setColorBy);
  const zoomLevel = useTimelineStore((s) => s.zoomLevel);
  const setZoomLevel = useTimelineStore((s) => s.setZoomLevel);
  const rowHeight = useTimelineStore((s) => s.rowHeight);

  const bodyRef = useRef<HTMLDivElement>(null);
  const zoomFocusRef = useRef<number | null>(null);
  // Stores { dayIndex, fractionalOffset } so we can restore the exact scroll
  // position after weekends toggle without rounding drift.
  const weekendFocusRef = useRef<{ dayIndex: number; fraction: number } | null>(null);

  const {
    rawDays,
    visibleDays,
    visibleMonths,
    dayToVisualIndex,
    visualIndexToDayIndex,
    getRelativeIndex,
  } = useTimeline(showWeekends);

  // Hidden weekend header markers (show blue glow where today falls in hidden weekend)
  const hiddenWeekendHeaderMarkers = useMemo(() => {
    if (showWeekends) return {};
    const markers: Record<number, boolean> = {};
    for (let i = 1; i < visibleDays.length; i++) {
      if (visibleDays[i].index > visibleDays[i - 1].index + 1) {
        // Check if today (index 0) falls in this gap
        const gapStart = visibleDays[i - 1].index + 1;
        const gapEnd = visibleDays[i].index;
        if (gapStart <= 0 && 0 < gapEnd) {
          markers[visibleDays[i].index] = true;
        }
      }
    }
    return markers;
  }, [showWeekends, visibleDays]);

  // Gantt bar drag handling (pointer events)
  const { dragState, handlePointerDown, settledOverrides, clearSettledOverride } = useGanttDrag({
    zoomLevel,
    showWeekends,
    rawDays,
    dayToVisualIndex,
    visualIndexToDayIndex,
    getRelativeIndex,
    onUpdateDate: onUpdateTaskDate,
  });

  // --- dnd-kit row reorder ---
  const sensors = useSortableSensors();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Find the active item (task or subitem) for DragOverlay
  const activeItem: Item | Subitem | null = activeId
    ? (project.tasks.find((t) => t.id === activeId) ??
       project.tasks.flatMap((t) => t.subitems).find((s) => s.id === activeId) ??
       null)
    : null;

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as { type: string; groupId?: string; parentTaskId?: string } | undefined;
      const overData = over.data.current as { type: string; groupId?: string } | undefined;
      if (!activeData || !overData) return;

      if (activeData.type === 'task' && overData.type === 'task') {
        const sourceGroupId = activeData.groupId ?? '';
        const targetGroupId = overData.groupId ?? '';

        if (sourceGroupId === targetGroupId) {
          const groupTasks = project.tasks.filter((t) => t.groupId === sourceGroupId);
          const fromIndex = groupTasks.findIndex((t) => t.id === active.id);
          const toIndex = groupTasks.findIndex((t) => t.id === over.id);
          if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            reorderTasks(project.id, sourceGroupId, fromIndex, toIndex);
          }
        } else {
          const targetGroupTasks = project.tasks.filter((t) => t.groupId === targetGroupId);
          const toIndex = targetGroupTasks.findIndex((t) => t.id === over.id);
          moveTaskToGroup(project.id, String(active.id), sourceGroupId, targetGroupId, toIndex);
        }
      } else if (activeData.type === 'subitem' && overData.type === 'subitem') {
        const parentTask = project.tasks.find((t) =>
          t.subitems.some((s) => s.id === active.id),
        );
        if (!parentTask) return;
        const fromIndex = parentTask.subitems.findIndex((s) => s.id === active.id);
        const toIndex = parentTask.subitems.findIndex((s) => s.id === over.id);
        if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
          reorderSubitems(project.id, parentTask.id, fromIndex, toIndex);
        }
      }
    },
    [project, reorderTasks, moveTaskToGroup, reorderSubitems],
  );

  // Scroll to today on mount (and when "Today" button is clicked)
  const scrollToToday = useScrollToToday(bodyRef, visibleDays, zoomLevel);
  const scrollToTodayRef = useRef(scrollToToday);
  scrollToTodayRef.current = scrollToToday;
  useEffect(() => {
    // Small delay to ensure layout is complete — runs only on mount
    const timer = setTimeout(() => scrollToTodayRef.current(), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Viewport-centered zoom: capture visual center in ref, restore in useLayoutEffect
  const handleZoomChange = useCallback((newZoom: number) => {
    const body = bodyRef.current;
    if (body) {
      const sidebarWidth = 320;
      const centerOffset = (body.clientWidth - sidebarWidth) / 2;
      const centerX = body.scrollLeft + centerOffset;
      zoomFocusRef.current = centerX / zoomLevel;
    }
    setZoomLevel(newZoom);
  }, [zoomLevel, setZoomLevel]);

  // Synchronous scroll restoration after zoom — runs before browser paint
  useLayoutEffect(() => {
    const anchorVisual = zoomFocusRef.current;
    if (anchorVisual === null) return;
    const container = bodyRef.current;
    if (!container) return;
    const sidebarWidth = 320;
    const centerOffset = (container.clientWidth - sidebarWidth) / 2;
    const targetX = anchorVisual * zoomLevel;
    container.scrollTo({ left: Math.max(0, targetX - centerOffset), behavior: 'auto' });
    zoomFocusRef.current = null;
  }, [zoomLevel]);

  // Synchronous scroll restoration after weekends toggle — uses day index
  // + fractional offset to restore exact position without rounding drift
  useLayoutEffect(() => {
    const anchor = weekendFocusRef.current;
    if (anchor === null) return;
    const container = bodyRef.current;
    if (!container) return;
    const targetVisualIdx = dayToVisualIndex[anchor.dayIndex];
    if (targetVisualIdx === undefined) {
      weekendFocusRef.current = null;
      return;
    }
    const sidebarWidth = 320;
    const centerOffset = (container.clientWidth - sidebarWidth) / 2;
    const targetX = (targetVisualIdx + anchor.fraction) * zoomLevel;
    container.scrollTo({ left: Math.max(0, targetX - centerOffset), behavior: 'auto' });
    weekendFocusRef.current = null;
  }, [showWeekends, zoomLevel, dayToVisualIndex]);

  // Get tasks for a group
  const getGroupTasks = (group: Group): Item[] =>
    project.tasks.filter((t) => t.groupId === group.id);

  const totalTimelineWidth = visibleDays.length * zoomLevel;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar — three-section layout: left toggles | center zoom | right today */}
        <div
          className={`flex items-center px-4 py-2 border-b shrink-0 ${
            darkMode
              ? 'bg-[#1c213e] border-[#2b2c32]'
              : 'bg-white border-[#eceff8]'
          }`}
        >
          {/* Left section: toggles */}
          <div className="flex items-center gap-2">
            {/* Weekends toggle — preserves scroll center */}
            <button
              onClick={() => {
                const body = bodyRef.current;
                if (body) {
                  const sidebarWidth = 320;
                  const centerOffset = (body.clientWidth - sidebarWidth) / 2;
                  const centerX = body.scrollLeft + centerOffset;
                  const visualIndexFloat = centerX / zoomLevel;
                  // Store the day index + fractional offset within that day
                  // so we can restore the exact position without rounding drift
                  const visualIndex = Math.floor(visualIndexFloat);
                  const fraction = visualIndexFloat - visualIndex;
                  const clampedIndex = Math.max(0, Math.min(visualIndex, visibleDays.length - 1));
                  const dayIndex = visibleDays[clampedIndex]?.index ?? null;
                  if (dayIndex !== null) {
                    weekendFocusRef.current = { dayIndex, fraction };
                  }
                }
                toggleWeekends();
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showWeekends
                  ? darkMode
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-blue-50 text-blue-600'
                  : darkMode
                    ? 'text-gray-400 hover:bg-white/10'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <CalendarDays size={14} />
              Weekends
            </button>

            {/* Labels toggle */}
            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                showLabels
                  ? darkMode
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-blue-50 text-blue-600'
                  : darkMode
                    ? 'text-gray-400 hover:bg-white/10'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Eye size={14} />
              Labels
            </button>

            {/* Color by */}
            <select
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value as 'status' | 'type')}
              className={`text-xs rounded px-2 py-1 border ${
                darkMode
                  ? 'bg-[#181b34] text-gray-300 border-[#2b2c32]'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              <option value="status">Color by Status</option>
              <option value="type">Color by Type</option>
            </select>
          </div>

          {/* Center section: zoom slider */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2">
              <ZoomOut size={14} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
              <input
                type="range"
                min={10}
                max={100}
                step={1}
                value={zoomLevel}
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="w-28 h-1.5 accent-blue-500 cursor-pointer"
                title={`Zoom: ${zoomLevel}px/day`}
              />
              <ZoomIn size={14} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
            </div>
          </div>

          {/* Right section: today button */}
          <div className="flex items-center gap-2">
            <button
              onClick={scrollToToday}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                darkMode
                  ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              Today
            </button>
          </div>
        </div>

        {/* Gantt body — scrollable */}
        <div
          ref={bodyRef}
          className="flex-1 overflow-auto"
        >
          <div style={{ minWidth: totalTimelineWidth + 320 }}>
            {/* Sticky header with label column spacer */}
            <div className="flex sticky top-0 z-40">
              {/* Label column header spacer */}
              <div
                className={`sticky left-0 z-[201] shrink-0 border-r border-b ${
                  darkMode
                    ? 'bg-[#1c213e] border-[#2b2c32]'
                    : 'bg-white border-[#eceff8]'
                }`}
                style={{ width: 320, minWidth: 320, height: 48 }}
              >
                <div className={`h-full flex items-center px-3 text-xs font-medium ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  Board
                </div>
              </div>

              {/* Timeline header */}
              <div className="flex-1">
                <GanttHeader
                  visibleDays={visibleDays}
                  visibleMonths={visibleMonths}
                  zoomLevel={zoomLevel}
                  showWeekends={showWeekends}
                  hiddenWeekendHeaderMarkers={hiddenWeekendHeaderMarkers}
                />
              </div>
            </div>

            {/* Groups + Tasks */}
            {project.groups.map((group) => {
              const groupTasks = getGroupTasks(group);
              const isCollapsed = collapsedGroups.includes(group.id);

              return (
                <div key={group.id}>
                  {/* Group header row */}
                  <div
                    className={`flex sticky top-12 z-30 border-b ${
                      darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'
                    }`}
                    style={{ height: rowHeight }}
                  >
                    {/* Group label — sticky left */}
                    <div
                      className="sticky left-0 z-[200] flex items-center gap-2 px-3 shrink-0 border-r cursor-pointer"
                      style={{
                        width: 320,
                        minWidth: 320,
                        backgroundColor: `${group.color}${darkMode ? '33' : '1A'}`,
                        borderColor: darkMode ? '#2b2c32' : '#eceff8',
                      }}
                      onClick={() => toggleGroupCollapse(group.id)}
                    >
                      <ChevronRight
                        size={14}
                        className={`transition-transform ${
                          isCollapsed ? '' : 'rotate-90'
                        } ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
                      />
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: group.color }}
                      >
                        {group.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 rounded-full ${
                          darkMode ? 'bg-white/10 text-gray-400' : 'bg-black/5 text-gray-500'
                        }`}
                      >
                        {groupTasks.length}
                      </span>
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddTaskToGroup(project.id, group.id);
                          }}
                          className={`ml-auto p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                            darkMode
                              ? 'hover:bg-white/10 text-gray-400'
                              : 'hover:bg-gray-200 text-gray-500'
                          }`}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>

                    {/* Group bar area — empty background grid */}
                    <div
                      className="relative flex-1"
                      style={{ minWidth: totalTimelineWidth }}
                    >
                      <div className="absolute inset-0 flex pointer-events-none">
                        {visibleDays.map((day) => (
                          <div
                            key={day.index}
                            className={`h-full border-r ${
                              day.isToday
                                ? 'bg-blue-500/5'
                                : day.isWeekend
                                  ? 'bg-black/[0.03]'
                                  : ''
                            } ${darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'}`}
                            style={{
                              width: zoomLevel,
                              minWidth: zoomLevel,
                              backgroundColor: `${group.color}${darkMode ? '10' : '08'}`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Task rows (hidden when collapsed) — wrapped in SortableContext */}
                  {!isCollapsed && (
                    <SortableContext
                      items={groupTasks.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {groupTasks.map((task) => {
                        const isTaskExpanded = expandedItems.includes(task.id);

                        return (
                          <div key={task.id}>
                            {/* Parent task row */}
                            <GanttTaskRow
                              task={task}
                              projectId={project.id}
                              isSubitem={false}
                              isExpanded={isTaskExpanded}
                              visibleDays={visibleDays}
                              zoomLevel={zoomLevel}
                              rowHeight={rowHeight}
                              showWeekends={showWeekends}
                              showLabels={showLabels}
                              colorBy={colorBy}
                              statuses={statuses}
                              jobTypes={jobTypes}
                              getRelativeIndex={getRelativeIndex}
                              dayToVisualIndex={dayToVisualIndex}
                              dragState={dragState}
                              settledOverrides={settledOverrides}
                              clearSettledOverride={clearSettledOverride}
                              canEdit={canEdit}
                              onMouseDown={handlePointerDown}
                              onUpdateName={(v) => onUpdateTaskName(project.id, task.id, v)}
                              onStatusSelect={(val) => onChangeStatus(project.id, task.id, null, val)}
                              onTypeSelect={(val) => onChangeJobType(project.id, task.id, null, val)}
                              onOpenUpdates={() =>
                                useUIStore.getState().openUpdatesPanel({
                                  taskId: task.id,
                                  subitemId: null,
                                  projectId: project.id,
                                })
                              }
                              onAddSubitem={onAddSubitem ? (pid, tid) => onAddSubitem(pid, tid) : undefined}
                            />

                            {/* Expanded subitems — nested SortableContext */}
                            {isTaskExpanded && (
                              <SortableContext
                                items={task.subitems.map((s) => s.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {task.subitems.map((sub) => (
                                  <GanttTaskRow
                                    key={sub.id}
                                    task={sub}
                                    projectId={project.id}
                                    parentTaskId={task.id}
                                    isSubitem
                                    visibleDays={visibleDays}
                                    zoomLevel={zoomLevel}
                                    rowHeight={rowHeight}
                                    showWeekends={showWeekends}
                                    showLabels={showLabels}
                                    colorBy={colorBy}
                                    statuses={statuses}
                                    jobTypes={jobTypes}
                                    getRelativeIndex={getRelativeIndex}
                                    dayToVisualIndex={dayToVisualIndex}
                                    dragState={dragState}
                                    settledOverrides={settledOverrides}
                                    clearSettledOverride={clearSettledOverride}
                                    canEdit={canEdit}
                                    onMouseDown={handlePointerDown}
                                    onUpdateName={(v) =>
                                      onUpdateSubitemName(project.id, task.id, sub.id, v)
                                    }
                                    onStatusSelect={(val) =>
                                      onChangeStatus(project.id, task.id, sub.id, val)
                                    }
                                    onTypeSelect={(val) =>
                                      onChangeJobType(project.id, task.id, sub.id, val)
                                    }
                                    onOpenUpdates={() =>
                                      useUIStore.getState().openUpdatesPanel({
                                        taskId: task.id,
                                        subitemId: sub.id,
                                        projectId: project.id,
                                      })
                                    }
                                  />
                                ))}
                              </SortableContext>
                            )}
                          </div>
                        );
                      })}
                    </SortableContext>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating drag overlay — shows task name while dragging */}
      <DragOverlay>
        {activeItem ? (
          <div
            className={`flex items-center h-9 px-3 rounded border shadow-xl text-xs font-medium cursor-grabbing opacity-95 ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200'
                : 'bg-white border-gray-200 text-gray-700'
            }`}
            style={{ width: 300 }}
          >
            {activeItem.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
