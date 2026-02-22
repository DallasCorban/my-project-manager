// GanttHeader — month + day column headers for the Gantt timeline.
// Ported from GanttView.jsx lines 103-187.

import type { TimelineDay } from '../../types/timeline';
import type { MonthGroup } from '../../hooks/useTimeline';
import { useUIStore } from '../../stores/uiStore';

interface GanttHeaderProps {
  visibleDays: TimelineDay[];
  visibleMonths: MonthGroup[];
  zoomLevel: number;
  showWeekends: boolean;
  hiddenWeekendHeaderMarkers: Record<number, boolean>;
}

export function GanttHeader({
  visibleDays,
  visibleMonths,
  zoomLevel,
  showWeekends,
  hiddenWeekendHeaderMarkers,
}: GanttHeaderProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  return (
    <div className="sticky top-0 z-40">
      {/* Month row */}
      <div className="flex h-6">
        {visibleMonths.map((month, mi) => (
          <div
            key={`${month.name}-${mi}`}
            className={`flex items-center px-2 text-[10px] font-semibold uppercase tracking-wide border-b ${
              darkMode
                ? 'bg-gradient-to-b from-[#1e2148] to-[#181b34] text-gray-400 border-[#2b2c32]'
                : 'bg-gradient-to-b from-gray-50 to-white text-gray-500 border-gray-200'
            }`}
            style={{ width: month.count * zoomLevel, minWidth: month.count * zoomLevel }}
          >
            <span className="truncate">{month.name}</span>
          </div>
        ))}
      </div>

      {/* Day row */}
      <div className="flex h-6">
        {visibleDays.map((day, i) => {
          // Detect hidden weekend gap (consecutive day indices skip > 1)
          const hasWeekendGap =
            !showWeekends && i > 0 && day.index > visibleDays[i - 1].index + 1;

          return (
            <div
              key={day.index}
              className={`relative flex items-center justify-center border-b text-center select-none ${
                hasWeekendGap
                  ? darkMode
                    ? 'border-l-2 border-l-[#3e3f4b]'
                    : 'border-l-2 border-l-gray-300'
                  : ''
              } ${
                day.isToday
                  ? 'bg-blue-600 text-white font-bold'
                  : day.isWeekend
                    ? darkMode
                      ? 'bg-[#151726] text-gray-600 border-[#2b2c32]'
                      : 'bg-slate-50 text-gray-400 border-gray-200'
                    : darkMode
                      ? 'bg-[#181b34] text-gray-500 border-[#2b2c32]'
                      : 'bg-white text-gray-500 border-gray-200'
              }`}
              style={{ width: zoomLevel, minWidth: zoomLevel }}
            >
              {/* Hidden weekend header marker (blue glow for today in hidden weekend) */}
              {hiddenWeekendHeaderMarkers[day.index] && (
                <div className="absolute inset-0 border-l-2 border-blue-500 pointer-events-none opacity-70" />
              )}

              {/* Week label when zoomed out */}
              {zoomLevel < 20 && (day.isMonday || i === 0) && (
                <span className="text-[7px] truncate">{day.weekLabel}</span>
              )}

              {/* Day number when zoomed in enough */}
              {zoomLevel >= 20 && (
                <span
                  className="leading-none"
                  style={{ fontSize: Math.max(10, Math.min(14, zoomLevel * 0.4)) }}
                >
                  {day.dayNum}
                </span>
              )}

              {/* Day abbreviation when very zoomed in */}
              {zoomLevel >= 40 && (
                <span className="text-[8px] ml-0.5 opacity-60">
                  {day.dayName.charAt(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
