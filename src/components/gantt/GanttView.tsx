// GanttView — main Gantt chart container.
// Renders timeline header, group sections, task rows with bars.
// Ported from GanttView.jsx (778 lines) + App.jsx drag handlers.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, CheckSquare, Square, Plus, ZoomIn, ZoomOut, CalendarDays, Eye } from 'lucide-react';
import { DndContext, DragOverlay, MeasuringStrategy } from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useTimeline } from '../../hooks/useTimeline';
import { useGanttDrag } from '../../hooks/useGanttDrag';
import { useScrollToToday } from '../../hooks/useScrollToToday';
import { useSortableSensors, sortableCollisionDetection } from '../../hooks/useSmartSensors';
import { GanttHeader } from './GanttHeader';
import { GanttTaskRow } from './GanttTaskRow';
import { ItemLabelCell } from '../shared/ItemLabelCell';
import { normalizeDateKey } from '../../utils/date';
import type { Board, Group } from '../../types/board';
import type { Item, Subitem } from '../../types/item';
import type { StatusLabel, JobTypeLabel } from '../../config/constants';

/**
 * Render-prop wrapper for useSortable on group headers.
 * Extracted as a component because hooks cannot be called inside .map() loops.
 * NOTE: No CSS transform is applied to the group container — applying a transform
 * would break position:sticky on the left label column in GanttView.
 */
type SortableGroupData = ReturnType<typeof useSortable>;
function SortableGroupContainer({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (
    isDragging: boolean,
    listeners: SortableGroupData['listeners'],
    setNodeRef: SortableGroupData['setNodeRef'],
    attributes: SortableGroupData['attributes'],
  ) => React.ReactNode;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({
    id,
    data: { type: 'group' },
    disabled,
  });
  return <>{children(isDragging, listeners, setNodeRef, attributes)}</>;
}

/* ─── Heatmap colour helpers ────────────────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * Two-phase heatmap colour based on raw task count.
 *   Phase 1 (0–5):  base background  →  full group colour
 *   Phase 2 (5–10): full group colour →  brightened (70% toward white)
 * Returns a fully opaque hex colour string.
 */
const HEATMAP_MID = 5;  // count where full group colour is reached
const HEATMAP_MAX = 10; // count where bright/glow peaks

function getHeatmapColor(count: number, groupColor: string, darkMode: boolean): string {
  const base = darkMode ? '#1c213e' : '#ffffff';

  if (count <= 0) return base;

  if (count <= HEATMAP_MID) {
    // Phase 1: base → full group colour
    return lerpColor(base, groupColor, count / HEATMAP_MID);
  }

  // Phase 2: full group colour → bright (70% toward white)
  const bright = lerpColor(groupColor, '#ffffff', 0.7);
  const t = Math.min((count - HEATMAP_MID) / (HEATMAP_MAX - HEATMAP_MID), 1);
  return lerpColor(groupColor, bright, t);
}

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
  const { reorderTasks, moveTaskToGroup, reorderSubitems, reorderGroups } = useProjectContext();

  const darkMode = useUIStore((s) => s.darkMode);
  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const toggleGroupCollapse = useUIStore((s) => s.toggleGroupCollapse);
  const setCollapsedGroups = useUIStore((s) => s.setCollapsedGroups);
  const expandedItems = useUIStore((s) => s.expandedItems);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const focusedBar = useUIStore((s) => s.focusedBar);
  const setFocusedBar = useUIStore((s) => s.setFocusedBar);

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
  /** Groups that were open before a group drag started — restored on drop. */
  const preGroupDragOpen = useRef<string[]>([]);
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
  /** ID of the droppable currently under the pointer — used to render the drop indicator. */
  const [overId, setOverId] = useState<string | null>(null);

  // Find the active group or item (task or subitem) for DragOverlay
  const activeGroup: Group | null = activeId
    ? (project.groups.find((g) => g.id === activeId) ?? null)
    : null;
  const activeGroupTaskCount = activeGroup
    ? project.tasks.filter((t) => t.groupId === activeGroup.id).length
    : 0;
  const activeItem: Item | Subitem | null = !activeGroup && activeId
    ? (project.tasks.find((t) => t.id === activeId) ??
       project.tasks.flatMap((t) => t.subitems).find((s) => s.id === activeId) ??
       null)
    : null;
  const activeIsSubitem = !activeGroup && activeId ? !project.tasks.some((t) => t.id === activeId) : false;
  const activeIsSelected = activeId ? selectedItems.has(activeId) : false;

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const data = active.data.current as { type?: string } | undefined;
    if (data?.type === 'group') {
      // Collapse all groups — monday.com style: only headers visible while dragging.
      // Save currently-open groups so we can restore them on drop.
      const allIds = project.groups.map((g) => g.id);
      preGroupDragOpen.current = allIds.filter((id) => !collapsedGroups.includes(id));
      setCollapsedGroups(allIds);
    }
    setActiveId(String(active.id));
  }, [project, collapsedGroups, setCollapsedGroups]);

  /** Tracks which droppable the pointer is currently over for the drop indicator. */
  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      // NOTE: setActiveId(null) is called at the END so the DragOverlay keeps its
      // content alive during dnd-kit's drop animation.

      const activeData = active.data.current as { type: string; groupId?: string; parentTaskId?: string } | undefined;
      const overData = over?.data.current as { type: string; groupId?: string } | undefined;

      // Always restore group open/close state after a group drag ends
      if (activeData?.type === 'group') {
        const allIds = project.groups.map((g) => g.id);
        setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
        preGroupDragOpen.current = [];
      }

      if (over && active.id !== over.id && activeData && overData) {
        if (activeData.type === 'group' && overData.type === 'group') {
          const fromIndex = project.groups.findIndex((g) => g.id === active.id);
          const toIndex = project.groups.findIndex((g) => g.id === over.id);
          if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
            reorderGroups(project.id, fromIndex, toIndex);
          }
        } else if (activeData.type === 'task' && overData.type === 'task') {
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
        } else if (activeData.type === 'task' && overData.type === 'subitem') {
          // Task dropped over an expanded subitem — route to the subitem's parent task.
          // This happens when expanded subitems occupy the drop zone between parent rows.
          const parentTask = project.tasks.find((t) =>
            t.subitems.some((s) => s.id === over.id),
          );
          if (parentTask && parentTask.id !== String(active.id)) {
            const sourceGroupId = activeData.groupId ?? '';
            const targetGroupId = parentTask.groupId;
            const groupTasks = project.tasks.filter((t) => t.groupId === targetGroupId);
            const fromIndex = groupTasks.findIndex((t) => t.id === active.id);
            const toIndex = groupTasks.findIndex((t) => t.id === parentTask.id);
            if (sourceGroupId === targetGroupId) {
              if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
                reorderTasks(project.id, targetGroupId, fromIndex, toIndex);
              }
            } else if (toIndex >= 0) {
              moveTaskToGroup(project.id, String(active.id), sourceGroupId, targetGroupId, toIndex);
            }
          }
        } else if (activeData.type === 'subitem' && overData.type === 'subitem') {
          const parentTask = project.tasks.find((t) =>
            t.subitems.some((s) => s.id === active.id),
          );
          if (parentTask) {
            const fromIndex = parentTask.subitems.findIndex((s) => s.id === active.id);
            const toIndex = parentTask.subitems.findIndex((s) => s.id === over.id);
            if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
              reorderSubitems(project.id, parentTask.id, fromIndex, toIndex);
            }
          }
        }
      }

      // Clear last — keeps DragOverlay content alive for the drop animation
      setOverId(null);
      setActiveId(null);
    },
    [project, reorderGroups, reorderTasks, moveTaskToGroup, reorderSubitems, setCollapsedGroups],
  );

  /** Called when the user cancels a drag (e.g. presses Escape). */
  const handleDragCancel = useCallback(() => {
    if (preGroupDragOpen.current.length > 0) {
      const allIds = project.groups.map((g) => g.id);
      setCollapsedGroups(allIds.filter((id) => !preGroupDragOpen.current.includes(id)));
      preGroupDragOpen.current = [];
    }
    setOverId(null);
    setActiveId(null);
  }, [project, setCollapsedGroups]);

  // Scroll to today on mount (and when "Today" button is clicked)
  const scrollToToday = useScrollToToday(bodyRef, visibleDays, zoomLevel);
  const scrollToTodayRef = useRef(scrollToToday);
  scrollToTodayRef.current = scrollToToday;
  useEffect(() => {
    // Small delay to ensure layout is complete — runs only on mount
    const timer = setTimeout(() => scrollToTodayRef.current(false), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoom anchor: if a bar is focused, anchor around its visual midpoint;
  // otherwise fall back to the viewport centre (original behaviour).
  const handleZoomChange = useCallback((newZoom: number) => {
    const body = bodyRef.current;
    if (!body) return;

    const sidebarWidth = 320;

    if (focusedBar) {
      // Look up the bar's task/subitem so the anchor stays fresh even after moves.
      const parentTask = project.tasks.find((t) => t.id === focusedBar.taskId);
      const barTask = focusedBar.subitemId
        ? parentTask?.subitems.find((s) => s.id === focusedBar.subitemId)
        : parentTask;

      let anchored = false;
      if (barTask) {
        const normalizedStart = normalizeDateKey(barTask.start);
        const relIdx = normalizedStart ? getRelativeIndex(normalizedStart) : null;
        if (relIdx !== null) {
          const startVisual = dayToVisualIndex[relIdx];
          if (startVisual !== undefined) {
            const duration = Math.max(1, Number(barTask.duration || 1));
            const rawEnd = relIdx + duration;
            const endVisual = dayToVisualIndex[rawEnd] ?? (startVisual + duration);
            // Store visual-slot midpoint — same unit as the viewport-centre anchor
            zoomFocusRef.current = startVisual + (endVisual - startVisual) / 2;
            anchored = true;
          }
        }
      }

      if (!anchored) {
        // Bar has no dates or is off-screen — fall back to viewport centre
        const centerX = body.scrollLeft + (body.clientWidth - sidebarWidth) / 2;
        zoomFocusRef.current = centerX / zoomLevel;
      }
    } else {
      // Default: viewport centre
      const centerX = body.scrollLeft + (body.clientWidth - sidebarWidth) / 2;
      zoomFocusRef.current = centerX / zoomLevel;
    }

    setZoomLevel(newZoom);
  }, [zoomLevel, setZoomLevel, focusedBar, project, getRelativeIndex, dayToVisualIndex]);

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

  // Per-group workload density maps for the heatmap on group header rows.
  // Stores raw task/subitem overlap count per day — the colour ramp is
  // applied at render time by getHeatmapColor.
  const groupDensityMaps = useMemo(() => {
    const result: Record<string, Map<number, number>> = {};

    for (const group of project.groups) {
      const tasks = project.tasks.filter((t) => t.groupId === group.id);
      const counts = new Map<number, number>();

      const countRange = (start: string | null, duration: number | null) => {
        const key = normalizeDateKey(start);
        if (!key) return;
        const relIdx = getRelativeIndex(key);
        if (relIdx === null) return;
        const dur = Math.max(1, Number(duration || 1));
        for (let d = 0; d < dur; d++) {
          const dayIdx = relIdx + d;
          counts.set(dayIdx, (counts.get(dayIdx) || 0) + 1);
        }
      };

      for (const task of tasks) {
        countRange(task.start, task.duration);
        for (const sub of task.subitems) {
          countRange(sub.start, sub.duration);
        }
      }

      result[group.id] = counts;
    }

    return result;
  }, [project.tasks, project.groups, getRelativeIndex]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sortableCollisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
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
              onClick={() => { setFocusedBar(null); scrollToToday(); }}
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

        {/* Gantt body — scrollable. Clicking empty space here (but not the
            toolbar above) clears the focused-bar selection. Bars call
            e.stopPropagation() on their own click so they don't trigger this. */}
        <div
          ref={bodyRef}
          className="flex-1 overflow-auto"
          onClick={() => setFocusedBar(null)}
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

            {/* Groups + Tasks — outer SortableContext enables group-level reorder */}
            <SortableContext
              items={project.groups.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              {project.groups.map((group) => {
                const groupTasks = getGroupTasks(group);
                const isCollapsed = collapsedGroups.includes(group.id);

                return (
                  <SortableGroupContainer key={group.id} id={group.id} disabled={!canEdit}>
                    {(isGroupDragging, groupListeners, setGroupRef, groupAttributes) => (
                      <div
                        ref={setGroupRef}
                        {...groupAttributes}
                        // NOTE: No CSS transform applied — would break position:sticky on label column
                        style={{ opacity: isGroupDragging ? 0.4 : 1 }}
                      >
                        {/* Group header row */}
                        <div
                          className={`flex sticky top-12 z-30 border-b group ${
                            darkMode ? 'border-[#2b2c32]' : 'border-[#eceff8]'
                          }`}
                          style={{ height: rowHeight }}
                        >
                          {/* Group label — sticky left, spread listeners as drag handle */}
                          <div
                            className={`sticky left-0 z-[200] flex items-center gap-2 px-3 shrink-0 border-r ${
                              canEdit ? 'cursor-grab active:cursor-grabbing' : ''
                            }`}
                            style={{
                              width: 320,
                              minWidth: 320,
                              background: `linear-gradient(${group.color}${darkMode ? '2e' : '18'}, ${group.color}${darkMode ? '2e' : '18'}), ${darkMode ? '#1c213e' : '#ffffff'}`,
                              borderColor: darkMode ? '#2b2c32' : '#eceff8',
                            }}
                            {...groupListeners}
                          >
                            {/* data-no-dnd: prevents SmartPointerSensor activating drag on collapse click */}
                            <div
                              className="flex items-center gap-2 flex-1 cursor-pointer"
                              data-no-dnd
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
                            </div>
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

                          {/* Group bar area — fully opaque heatmap (no grid/borders visible) */}
                          <div
                            className="relative flex-1"
                            style={{ minWidth: totalTimelineWidth }}
                          >
                            <div className="absolute inset-0 flex pointer-events-none">
                              {visibleDays.map((day) => {
                                const count = groupDensityMaps[group.id]?.get(day.index) ?? 0;

                                return (
                                  <div
                                    key={day.index}
                                    className="h-full"
                                    style={{
                                      width: zoomLevel,
                                      minWidth: zoomLevel,
                                      backgroundColor: getHeatmapColor(count, group.color, darkMode),
                                    }}
                                  />
                                );
                              })}
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
                                    isDropTarget={activeId !== null && overId === task.id}
                                    dropBelow={
                                      activeId !== null &&
                                      overId === task.id &&
                                      groupTasks.findIndex((t) => t.id === activeId) < groupTasks.findIndex((t) => t.id === task.id)
                                    }
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
                                    isBarSelected={focusedBar?.taskId === task.id && focusedBar?.subitemId === null}
                                    onSelect={() => setFocusedBar({ taskId: task.id, subitemId: null })}
                                    onMouseDown={handlePointerDown}
                                    onUpdateName={(v) => onUpdateTaskName(project.id, task.id, v)}
                                    onStatusSelect={(val) => onChangeStatus(project.id, task.id, null, val)}
                                    onTypeSelect={(val) => onChangeJobType(project.id, task.id, null, val)}
                                    onOpenUpdates={() =>
                                      useUIStore.getState().toggleUpdatesPanel({
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
                                          isDropTarget={activeId !== null && overId === sub.id}
                                          dropBelow={
                                            activeId !== null &&
                                            overId === sub.id &&
                                            task.subitems.findIndex((s) => s.id === activeId) < task.subitems.findIndex((s) => s.id === sub.id)
                                          }
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
                                          isBarSelected={focusedBar?.taskId === task.id && focusedBar?.subitemId === sub.id}
                                          onSelect={() => setFocusedBar({ taskId: task.id, subitemId: sub.id })}
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
                                            useUIStore.getState().toggleUpdatesPanel({
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
                    )}
                  </SortableGroupContainer>
                );
              })}
            </SortableContext>
          </div>
        </div>
      </div>

      {/* Floating drag overlay — group header chip or label column replica with checkbox */}
      <DragOverlay>
        {activeGroup ? (
          // Group ghost — header chip
          <div
            className={`flex items-center gap-2 px-3 border-r border-b shadow-xl cursor-grabbing ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32]'
                : 'bg-white border-[#eceff8]'
            }`}
            style={{ width: 320, height: rowHeight, borderLeft: `3px solid ${activeGroup.color}` }}
          >
            <ChevronRight size={14} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
            <span
              className="text-sm font-medium truncate"
              style={{ color: activeGroup.color }}
            >
              {activeGroup.name}
            </span>
            <span
              className={`text-[10px] px-1.5 rounded-full ml-auto ${
                darkMode ? 'bg-white/10 text-gray-400' : 'bg-black/5 text-gray-500'
              }`}
            >
              {activeGroupTaskCount}
            </span>
          </div>
        ) : activeItem ? (
          // Item / subitem ghost — with checkbox reflecting selection state
          <div
            className={`flex items-center px-3 border-r border-b shadow-xl cursor-grabbing group [&_button]:!opacity-100 ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32]'
                : 'bg-white border-[#eceff8]'
            }`}
            style={{ width: 320, height: rowHeight }}
          >
            <div className="shrink-0 mr-1">
              {activeIsSelected
                ? <CheckSquare size={15} className="text-blue-500" />
                : <Square size={15} className="text-gray-400 opacity-50" />}
            </div>
            <ItemLabelCell
              task={activeItem}
              isSubitem={activeIsSubitem}
              canEdit={false}
              darkMode={darkMode}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
