// DatePickerPopup — calendar date picker for task/subitem dates.
// Renders as a portal overlay. Supports start date selection and duration.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useClickOutside } from '../../hooks/useClickOutside';
import { toLocalDateKey, diffDays } from '../../utils/date';

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function DatePickerPopup() {
  const darkMode = useUIStore((s) => s.darkMode);
  const datePickerOpen = useUIStore((s) => s.datePickerOpen);
  const closeDatePicker = useUIStore((s) => s.closeDatePicker);
  const { projects, updateTaskDate } = useProjectContext();

  const popupRef = useRef<HTMLDivElement>(null);

  useClickOutside(popupRef, closeDatePicker, Boolean(datePickerOpen));

  // Escape to close
  useEffect(() => {
    if (!datePickerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDatePicker();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [datePickerOpen, closeDatePicker]);

  // Resolve current task/subitem dates
  const currentDates = useMemo(() => {
    if (!datePickerOpen) return { start: null as string | null, duration: 1 };
    const { projectId, taskId, subitemId } = datePickerOpen;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return { start: null, duration: 1 };
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) return { start: null, duration: 1 };

    if (subitemId) {
      const sub = task.subitems.find((s) => s.id === subitemId);
      return { start: (sub?.start as string) || null, duration: Number(sub?.duration || 1) };
    }
    return { start: (task.start as string) || null, duration: Number(task.duration || 1) };
  }, [datePickerOpen, projects]);

  // Calendar state
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  // Initialize selection from current dates
  useEffect(() => {
    if (currentDates.start) {
      setSelStart(currentDates.start);
      if (currentDates.duration > 1) {
        const startDate = new Date(currentDates.start + 'T00:00:00');
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + currentDates.duration - 1);
        setSelEnd(toLocalDateKey(endDate));
      } else {
        setSelEnd(currentDates.start);
      }
      // Set view to the start month
      const d = new Date(currentDates.start + 'T00:00:00');
      setViewMonth(d.getMonth());
      setViewYear(d.getFullYear());
    } else {
      setSelStart(null);
      setSelEnd(null);
      setViewMonth(today.getMonth());
      setViewYear(today.getFullYear());
    }
    setSelecting(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePickerOpen]);

  const handleDayClick = useCallback((dateKey: string) => {
    if (!selecting && selStart === null) {
      // First click — set start
      setSelStart(dateKey);
      setSelEnd(dateKey);
      setSelecting(true);
    } else if (selecting) {
      // Second click — set end
      let start = selStart!;
      let end = dateKey;
      if (start > end) [start, end] = [end, start];
      setSelStart(start);
      setSelEnd(end);
      setSelecting(false);
    } else {
      // Restart selection
      setSelStart(dateKey);
      setSelEnd(dateKey);
      setSelecting(true);
    }
  }, [selecting, selStart]);

  const handleMouseEnter = useCallback((dateKey: string) => {
    if (selecting && selStart) {
      setSelEnd(dateKey);
    }
  }, [selecting, selStart]);

  const handleApply = useCallback(() => {
    if (!datePickerOpen || !selStart) return;
    const { projectId, taskId, subitemId } = datePickerOpen;
    let start = selStart;
    let end = selEnd || selStart;
    if (start > end) [start, end] = [end, start];
    const duration = (diffDays(start, end) ?? 0) + 1;
    updateTaskDate(projectId, taskId, subitemId, start, duration);
    closeDatePicker();
  }, [datePickerOpen, selStart, selEnd, updateTaskDate, closeDatePicker]);

  const handleClear = useCallback(() => {
    if (!datePickerOpen) return;
    const { projectId, taskId, subitemId } = datePickerOpen;
    updateTaskDate(projectId, taskId, subitemId, null, null);
    closeDatePicker();
  }, [datePickerOpen, updateTaskDate, closeDatePicker]);

  if (!datePickerOpen) return null;

  // Calendar grid generation
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
  const startDay = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const calendarDays: (string | null)[] = [];
  // Fill blanks for days before month start
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  // Fill month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    calendarDays.push(toLocalDateKey(date));
  }

  const todayKey = toLocalDateKey(today);

  // Determine selection range for highlighting
  let rangeStart = selStart;
  let rangeEnd = selEnd;
  if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
    [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  }

  const isInRange = (key: string) => {
    if (!rangeStart || !rangeEnd) return false;
    return key >= rangeStart && key <= rangeEnd;
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const popup = (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/20">
      <div
        ref={popupRef}
        className={`w-80 rounded-xl shadow-2xl border p-4 ${
          darkMode ? 'bg-[#1c213e] border-[#323652] text-gray-200' : 'bg-white border-gray-300 text-gray-800'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={prevMonth}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            onClick={nextMonth}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              className={`text-[10px] font-medium text-center py-1 ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`}
            >
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((dayKey, i) => {
            if (!dayKey) {
              return <div key={`blank-${i}`} className="h-8" />;
            }
            const dayNum = new Date(dayKey + 'T00:00:00').getDate();
            const isToday = dayKey === todayKey;
            const isStart = dayKey === rangeStart;
            const isEnd = dayKey === rangeEnd;
            const inRange = isInRange(dayKey);
            const isWeekend = new Date(dayKey + 'T00:00:00').getDay() % 6 === 0;

            return (
              <button
                key={dayKey}
                className={`h-8 text-xs rounded-md transition-all duration-100 relative ${
                  isStart || isEnd
                    ? 'bg-blue-600 text-white font-semibold'
                    : inRange
                      ? darkMode
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-blue-100 text-blue-700'
                      : isToday
                        ? darkMode
                          ? 'ring-1 ring-blue-400 text-blue-400'
                          : 'ring-1 ring-blue-500 text-blue-600'
                        : isWeekend
                          ? darkMode
                            ? 'text-gray-500 hover:bg-white/5'
                            : 'text-gray-400 hover:bg-gray-50'
                          : darkMode
                            ? 'text-gray-200 hover:bg-white/10'
                            : 'text-gray-700 hover:bg-gray-100'
                }`}
                onClick={() => handleDayClick(dayKey)}
                onMouseEnter={() => handleMouseEnter(dayKey)}
              >
                {dayNum}
              </button>
            );
          })}
        </div>

        {/* Selection info */}
        {selStart && (
          <div className={`mt-3 text-xs text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {selStart === selEnd || !selEnd
              ? selStart
              : `${rangeStart} → ${rangeEnd} (${(diffDays(rangeStart!, rangeEnd!) ?? 0) + 1} days)`}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-3 gap-2">
          <button
            onClick={handleClear}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              darkMode
                ? 'text-gray-400 hover:bg-white/10'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <X size={12} /> Clear
          </button>
          <div className="flex gap-2">
            <button
              onClick={closeDatePicker}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                darkMode
                  ? 'text-gray-400 hover:bg-white/10'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!selStart}
              className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(popup, document.body);
}
