// GanttSubitemStack — renders collapsed subitem bars in horizontal lanes within a parent row.
// Shows normal-sized bars with proper stacking and tooltips.
// Ported from GanttView.jsx lines 345-390 (lane algorithm) and 474-518 (rendering).

import { useMemo, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import type { Subitem } from '../../types/item';

interface SubitemLane {
  subitem: Subitem;
  laneIndex: number;
  startVisual: number;
  widthVisual: number;
}

interface GanttSubitemStackProps {
  subitems: Subitem[];
  zoomLevel: number;
  rowHeight: number;
  getRelativeIndex: (dateKey: string | null | undefined) => number;
  dayToVisualIndex: Record<number, number>;
  getColor: (item: Subitem) => string;
}

export function GanttSubitemStack({
  subitems,
  zoomLevel,
  rowHeight,
  getRelativeIndex,
  dayToVisualIndex,
  getColor,
}: GanttSubitemStackProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { lanes, maxLanes } = useMemo(() => {
    // Filter subitems that have dates
    const dated = subitems
      .filter((s) => s.start)
      .map((s) => {
        const relIdx = getRelativeIndex(s.start as string);
        const dur = Math.max(1, Number(s.duration || 1));
        const startVis = dayToVisualIndex[relIdx] ?? 0;
        const endVis = dayToVisualIndex[relIdx + dur] ?? startVis + dur;
        return { subitem: s, start: startVis, end: endVis };
      })
      .sort((a, b) => a.start - b.start);

    // Lane assignment algorithm — pack subitems into horizontal lanes
    const laneEnds: number[] = []; // tracks end position of each lane
    const result: SubitemLane[] = [];

    for (const item of dated) {
      let assignedLane = -1;
      for (let l = 0; l < laneEnds.length; l++) {
        if (laneEnds[l] <= item.start) {
          assignedLane = l;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[assignedLane] = item.end;

      result.push({
        subitem: item.subitem,
        laneIndex: assignedLane,
        startVisual: item.start,
        widthVisual: item.end - item.start,
      });
    }

    return { lanes: result, maxLanes: laneEnds.length || 1 };
  }, [subitems, getRelativeIndex, dayToVisualIndex]);

  if (lanes.length === 0) return null;

  const barHeight = 16;
  const laneSpacing = 20;
  const totalHeight = maxLanes * laneSpacing;
  const baseOffset = (rowHeight - totalHeight) / 2;

  return (
    <div className="absolute inset-0">
      {lanes.map((item) => {
        const left = item.startVisual * zoomLevel;
        const width = Math.max(item.widthVisual * zoomLevel, zoomLevel * 0.5);
        const topOffset = baseOffset + item.laneIndex * laneSpacing + (laneSpacing - barHeight) / 2;
        const isHovered = hoveredId === item.subitem.id;

        return (
          <div
            key={item.subitem.id}
            className={`absolute rounded-sm cursor-pointer transition-all duration-100 ${
              isHovered ? 'ring-2 ring-white/40 z-10' : ''
            } ${darkMode ? 'border border-[#181b34]' : 'border border-white/30'}`}
            style={{
              left,
              width,
              top: topOffset,
              height: barHeight,
              backgroundColor: getColor(item.subitem),
              opacity: isHovered ? 1 : 0.8,
            }}
            onMouseEnter={() => setHoveredId(item.subitem.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Label (if bar wide enough) */}
            {width > 40 && zoomLevel > 15 && (
              <span className="text-[8px] text-white px-1 truncate leading-[16px] pointer-events-none">
                {item.subitem.name}
              </span>
            )}

            {/* Tooltip on hover */}
            {isHovered && (
              <div
                className={`absolute -top-7 left-0 px-2 py-0.5 rounded text-[10px] whitespace-nowrap shadow-md z-50 ${
                  darkMode
                    ? 'bg-[#0f1224] text-gray-200 border border-[#2b2c32]'
                    : 'bg-gray-800 text-white'
                }`}
              >
                {item.subitem.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
