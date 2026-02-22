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
                ? 'bg-gradient-to-b from-[#1e2148] to-[#181b34] text-gray-400 border-[#343856]'
                : 'bg-gradient-to-b from-gray-50 to-white text-gray-500 border-gray-300'
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
                    ? 'border-l-2 border-l-[#3d4058]'
                    : 'border-l-2 border-l-gray-300'
                  : ''
              } ${
                zoomLevel >= 20
                  ? darkMode ? 'border-r border-r-[#343856]' : 'border-r border-r-gray-200'
                  : ''
              } ${
                day.isToday
                  ? 'bg-blue-600 text-white font-bold'
                  : day.isWeekend
                    ? darkMode
                      ? 'bg-[#151726] text-gray-600 border-[#343856]'
                      : 'bg-slate-50 text-gray-400 border-gray-300'
                    : darkMode
                      ? 'bg-[#181b34] text-gray-500 border-[#343856]'
                      : 'bg-white text-gray-500 border-gray-300'
              }`}
              style={{ width: zoomLevel, minWidth: zoomLevel }}
            >
              {/* Hidden weekend header marker (blue glow for today in hidden weekend) */}
              {hiddenWeekendHeaderMarkers[day.index] && (
                <div className="absolute inset-0 border-l-2 border-blue-500 pointer-events-none opacity-70" />
              )}

              {/* Week range label when zoomed out — overlay spans Mon–Fri (5 weekday columns) */}
              {zoomLevel < 20 && day.isMonday && day.weekLabel && (
                <div
                  className="absolute inset-y-0 flex items-center justify-center pointer-events-none z-[1]"
                  style={{ width: 5 * zoomLevel }}
                >
                  <span className={`text-[11px] font-semibold whitespace-nowrap ${
                    darkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {day.weekLabel}
                  </span>
                </div>
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
