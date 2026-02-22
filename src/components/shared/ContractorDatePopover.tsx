// ContractorDatePopover — calendar popover for setting contractor end dates.
// Anchored to a trigger element, rendered via portal. Supports quick presets
// and "Make Permanent" promotion for existing contractors.

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X, UserCheck } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { toLocalDateKey } from '../../utils/date';

const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface QuickPreset {
  label: string;
  days: number;
}

const QUICK_PRESETS: QuickPreset[] = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6mo', days: 182 },
  { label: '1yr', days: 365 },
];

interface ContractorDatePopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  currentDate: Date | null;
  isNewContractor: boolean;
  darkMode: boolean;
  onApply: (date: Date) => void;
  onMakePermanent: () => void;
  onClose: () => void;
}

export function ContractorDatePopover({
  anchorRef,
  currentDate,
  isNewContractor,
  darkMode,
  onApply,
  onMakePermanent,
  onClose,
}: ContractorDatePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const todayKey = toLocalDateKey(today);

  // Calendar view state
  const initDate = currentDate && currentDate.getTime() > Date.now() ? currentDate : today;
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());
  const [viewYear, setViewYear] = useState(initDate.getFullYear());

  // Selected date
  const [selectedKey, setSelectedKey] = useState<string | null>(
    currentDate ? toLocalDateKey(currentDate) : null,
  );

  // Position state
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Click outside to close
  useClickOutside(popoverRef, onClose, true);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Compute position from anchor
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const popoverHeight = 420; // approximate
    const popoverWidth = 280;

    let top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;

    // If it would overflow bottom, position above
    if (top + popoverHeight > window.innerHeight - 16) {
      top = rect.top - popoverHeight - 6;
    }

    // Clamp horizontal
    left = Math.max(8, Math.min(left, window.innerWidth - popoverWidth - 8));

    // Clamp top
    top = Math.max(8, top);

    setPos({ top, left });
  }, [anchorRef]);

  // Calendar grid generation (same pattern as DatePickerPopup)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
  const startDay = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const calendarDays: (string | null)[] = [];
  for (let i = 0; i < startDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    calendarDays.push(toLocalDateKey(date));
  }

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const handlePreset = useCallback((days: number) => {
    const target = new Date();
    target.setDate(target.getDate() + days);
    const key = toLocalDateKey(target);
    setSelectedKey(key);
    setViewMonth(target.getMonth());
    setViewYear(target.getFullYear());
  }, []);

  const handleDayClick = useCallback((dayKey: string) => {
    setSelectedKey(dayKey);
  }, []);

  const handleApply = useCallback(() => {
    if (!selectedKey) return;
    const [y, m, d] = selectedKey.split('-').map(Number);
    const date = new Date(y, m - 1, d, 23, 59, 59, 999);
    onApply(date);
  }, [selectedKey, onApply]);

  // Format selected date for display
  const selectedDisplayText = selectedKey
    ? (() => {
        const [y, m, d] = selectedKey.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return `Expires: ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })()
    : 'No date selected';

  // Check which preset matches
  const matchingPreset = (days: number) => {
    if (!selectedKey) return false;
    const target = new Date();
    target.setDate(target.getDate() + days);
    return toLocalDateKey(target) === selectedKey;
  };

  if (!pos) return null;

  const popover = (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 500 }}
      className={`w-[280px] rounded-xl shadow-2xl border ${
        darkMode ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200' : 'bg-white border-gray-200 text-gray-800'
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 pt-3 pb-2`}>
        <span className="text-sm font-semibold">Contract End Date</span>
        <button
          onClick={onClose}
          className={`p-1 rounded transition-colors ${
            darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          <X size={14} />
        </button>
      </div>

      {/* Quick presets */}
      <div className="flex gap-1.5 px-4 pb-2">
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePreset(preset.days)}
            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
              matchingPreset(preset.days)
                ? 'bg-blue-600 text-white'
                : darkMode
                  ? 'bg-white/5 text-gray-300 hover:bg-white/10'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <button
          onClick={prevMonth}
          className={`p-1 rounded transition-colors ${
            darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
          }`}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className={`p-1 rounded transition-colors ${
            darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
          }`}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-0.5 px-3 mb-0.5">
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            className={`text-[9px] font-medium text-center py-0.5 ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5 px-3">
        {calendarDays.map((dayKey, i) => {
          if (!dayKey) {
            return <div key={`blank-${i}`} className="h-7" />;
          }
          const dayNum = new Date(dayKey + 'T00:00:00').getDate();
          const isToday = dayKey === todayKey;
          const isSelected = dayKey === selectedKey;
          const isPast = dayKey < todayKey;
          const isWeekend = new Date(dayKey + 'T00:00:00').getDay() % 6 === 0;

          return (
            <button
              key={dayKey}
              onClick={() => handleDayClick(dayKey)}
              className={`h-7 text-[11px] rounded-md transition-all duration-100 ${
                isSelected
                  ? 'bg-blue-600 text-white font-semibold'
                  : isToday
                    ? darkMode
                      ? 'ring-1 ring-blue-400 text-blue-400'
                      : 'ring-1 ring-blue-500 text-blue-600'
                    : isPast
                      ? darkMode
                        ? 'text-gray-600 hover:bg-white/5'
                        : 'text-gray-300 hover:bg-gray-50'
                      : isWeekend
                        ? darkMode
                          ? 'text-gray-500 hover:bg-white/5'
                          : 'text-gray-400 hover:bg-gray-50'
                        : darkMode
                          ? 'text-gray-200 hover:bg-white/10'
                          : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      <div className={`text-center text-[11px] mt-2 px-4 ${
        selectedKey
          ? selectedKey < todayKey
            ? 'text-red-400'
            : darkMode ? 'text-gray-400' : 'text-gray-500'
          : darkMode ? 'text-gray-500' : 'text-gray-400'
      }`}>
        {selectedKey && selectedKey < todayKey
          ? `Warning: ${selectedDisplayText.replace('Expires:', 'Already expired on')}`
          : selectedDisplayText}
      </div>

      {/* Footer */}
      <div className={`flex items-center justify-between px-4 py-3 mt-2 border-t ${
        darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
      }`}>
        {/* Make Permanent — only for existing contractors, not new ones */}
        {!isNewContractor ? (
          <button
            onClick={onMakePermanent}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
              darkMode
                ? 'text-emerald-400 hover:bg-emerald-500/10'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
          >
            <UserCheck size={12} />
            Make Permanent
          </button>
        ) : (
          <div />
        )}

        <div className="flex gap-1.5">
          <button
            onClick={onClose}
            className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
              darkMode
                ? 'text-gray-400 hover:bg-white/10'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!selectedKey}
            className="px-3 py-1.5 text-[11px] rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(popover, document.body);
}
