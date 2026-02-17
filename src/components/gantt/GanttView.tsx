// GanttView — main Gantt chart container.
// Renders timeline header, group sections, task rows with bars.
// Ported from GanttView.jsx (778 lines) + App.jsx drag handlers.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Plus, ZoomIn, ZoomOut, CalendarDays, Eye } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTimeline } from '../../hooks/useTimeline';
import { useGanttDrag } from '../../hooks/useGanttDrag';
import { useScrollToToday } from '../../hooks/useScrollToToday';
import { GanttHeader } from './GanttHeader';
import { GanttTaskRow } from './GanttTaskRow';
import type { Board, Group } from '../../types/board';
import type { Item } from '../../types/item';
import type { ReorderDrag } from '../../types/timeline';
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

const INITIAL_REORDER: ReorderDrag = {
  active: false,
  type: null,
  dragId: null,
  parentId: null,
  dropTargetId: null,
  dropTargetType: null,
  dropTargetProjectId: null,
  sourceProjectId: null,
  dropPosition: 'after',
  originalExpanded: false,
};

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
  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const toggleGroupCollapse = useUIStore((s) => s.toggleGroupCollapse);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const toggleItemExpand = useUIStore((s) => s.toggleItemExpand);

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

  // Gantt bar drag handling
  const { dragState, handleMouseDown, settledOverrides, clearSettledOverride } = useGanttDrag({
    zoomLevel,
    showWeekends,
    rawDays,
    dayToVisualIndex,
    visualIndexToDayIndex,
    getRelativeIndex,
    onUpdateDate: onUpdateTaskDate,
  });

  // Row reorder
  const [reorderDrag, setReorderDrag] = useState<ReorderDrag>(INITIAL_REORDER);

  const handleRowDragStart = useCallback(
    (e: React.DragEvent, type: string, id: string, pid: string) => {
      if (!canEdit) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      // Collapse if expanded
      if (expandedItems.includes(id)) {
        toggleItemExpand(id);
      }
      setReorderDrag({
        active: true,
        type: type as 'task' | 'subitem',
        dragId: id,
        parentId: null,
        dropTargetId: null,
        dropTargetType: null,
        dropTargetProjectId: null,
        sourceProjectId: pid,
        dropPosition: 'after',
        originalExpanded: expandedItems.includes(id),
      });
    },
    [canEdit, expandedItems, toggleItemExpand],
  );

  const handleRowDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!reorderDrag.active) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const pos = e.clientY < midY ? 'before' : 'after';
      // Get target info from data attributes
      const target = e.currentTarget as HTMLElement;
      const tid = target.dataset.taskId;
      if (tid && tid !== reorderDrag.dropTargetId) {
        setReorderDrag((prev) => ({
          ...prev,
          dropTargetId: tid,
          dropPosition: pos as 'before' | 'after',
        }));
      } else if (tid) {
        setReorderDrag((prev) => ({ ...prev, dropPosition: pos as 'before' | 'after' }));
      }
    },
    [reorderDrag.active, reorderDrag.dropTargetId],
  );

  const handleRowDrop = useCallback(
    (_e: React.DragEvent, _type: string, _id: string, _pid: string) => {
      // Row reorder drop logic is handled in the parent via project store
      // For now, just clear the drag state
      setReorderDrag(INITIAL_REORDER);
    },
    [],
  );

  const handleRowDragEnd = useCallback(() => {
    setReorderDrag(INITIAL_REORDER);
  }, []);

  // Scroll to today on mount
  const scrollToToday = useScrollToToday(bodyRef, visibleDays, zoomLevel);
  useEffect(() => {
    // Small delay to ensure layout is complete
    const timer = setTimeout(scrollToToday, 100);
    return () => clearTimeout(timer);
  }, [scrollToToday]);

  // Viewport-centered zoom: calculate center day before zoom, restore after
  const handleZoomChange = useCallback((newZoom: number) => {
    const body = bodyRef.current;
    if (!body) {
      setZoomLevel(newZoom);
      return;
    }
    // Find center day index before zoom
    const viewportCenter = body.scrollLeft + body.clientWidth / 2 - 320; // 320 = label column width
    const centerDayIdx = viewportCenter / zoomLevel;
    setZoomLevel(newZoom);
    // After React re-renders, scroll to keep center day centered
    requestAnimationFrame(() => {
      const newCenter = centerDayIdx * newZoom;
      body.scrollLeft = newCenter - body.clientWidth / 2 + 320;
    });
  }, [zoomLevel, setZoomLevel]);

  // Get tasks for a group
  const getGroupTasks = (group: Group): Item[] =>
    project.tasks.filter((t) => t.groupId === group.id);

  const totalTimelineWidth = visibleDays.length * zoomLevel;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div
        className={`flex items-center gap-2 px-4 py-2 border-b shrink-0 ${
          darkMode
            ? 'bg-[#1c213e] border-[#2b2c32]'
            : 'bg-white border-[#eceff8]'
        }`}
      >
        {/* Zoom slider */}
        <div className="flex items-center gap-2">
          <ZoomOut size={14} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
          <input
            type="range"
            min={12}
            max={80}
            step={1}
            value={zoomLevel}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-24 h-1.5 accent-blue-500 cursor-pointer"
            title={`Zoom: ${zoomLevel}px/day`}
          />
          <ZoomIn size={14} className={darkMode ? 'text-gray-500' : 'text-gray-400'} />
        </div>

        <div className={`w-px h-4 ${darkMode ? 'bg-[#2b2c32]' : 'bg-gray-200'}`} />

        {/* Weekends toggle — preserves scroll center */}
        <button
          onClick={() => {
            const body = bodyRef.current;
            if (body) {
              const viewportCenter = body.scrollLeft + body.clientWidth / 2 - 320;
              const centerDayIdx = viewportCenter / zoomLevel;
              toggleWeekends();
              requestAnimationFrame(() => {
                body.scrollLeft = centerDayIdx * zoomLevel - body.clientWidth / 2 + 320;
              });
            } else {
              toggleWeekends();
            }
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

        <div className="flex-1" />

        {/* Scroll to today */}
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

                {/* Task rows (hidden when collapsed) */}
                {!isCollapsed &&
                  groupTasks.map((task) => {
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
                          reorderDrag={reorderDrag}
                          canEdit={canEdit}
                          onMouseDown={handleMouseDown}
                          onRowDragStart={handleRowDragStart}
                          onRowDragOver={handleRowDragOver}
                          onRowDrop={handleRowDrop}
                          onRowDragEnd={handleRowDragEnd}
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

                        {/* Expanded subitems */}
                        {isTaskExpanded &&
                          task.subitems.map((sub) => (
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
                              reorderDrag={reorderDrag}
                              canEdit={canEdit}
                              onMouseDown={handleMouseDown}
                              onRowDragStart={handleRowDragStart}
                              onRowDragOver={handleRowDragOver}
                              onRowDrop={handleRowDrop}
                              onRowDragEnd={handleRowDragEnd}
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
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
