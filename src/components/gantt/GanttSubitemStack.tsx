// GanttSubitemStack — renders collapsed subitem bars in horizontal lanes within a parent row.
// Ported from GanttView.jsx lines 345-390 (lane algorithm) and 474-518 (rendering).

import { useMemo } from 'react';
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
      // Find first lane where this item fits
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

  return (
    <div className="absolute inset-0 pointer-events-none">
      {lanes.map((item) => {
        const left = item.startVisual * zoomLevel;
        const width = Math.max(item.widthVisual * zoomLevel, zoomLevel * 0.5);
        const barHeight = 3;
        // Center lanes vertically within the row
        const laneSpacing = 6;
        const totalHeight = maxLanes * laneSpacing;
        const topOffset = (rowHeight - totalHeight) / 2 + item.laneIndex * laneSpacing;

        return (
          <div
            key={item.subitem.id}
            className="absolute rounded-sm"
            style={{
              left,
              width,
              top: topOffset,
              height: barHeight,
              backgroundColor: getColor(item.subitem),
              opacity: 0.7,
            }}
          />
        );
      })}
    </div>
  );
}
