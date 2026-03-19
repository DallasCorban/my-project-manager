// Timeline store — Gantt view settings (persisted).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardColumns, DraggableColumnKey } from '../types/timeline';
import { DEFAULT_BOARD_COLUMNS, DEFAULT_COLUMN_ORDER } from '../config/constants';

interface TimelineState {
  showWeekends: boolean;
  showLabels: boolean;
  colorBy: 'status' | 'type';
  zoomLevel: number;
  rowHeight: number;
  boardColumnsByEntity: Record<string, BoardColumns>;
  columnOrderByEntity: Record<string, DraggableColumnKey[]>;

  setShowWeekends: (show: boolean) => void;
  toggleWeekends: () => void;
  setShowLabels: (show: boolean) => void;
  setColorBy: (by: 'status' | 'type') => void;
  setZoomLevel: (level: number) => void;
  setRowHeight: (height: number) => void;
  setBoardColumns: (entityId: string, columns: BoardColumns) => void;
  getBoardColumns: (entityId: string) => BoardColumns;
  setColumnOrder: (entityId: string, order: DraggableColumnKey[]) => void;
  getColumnOrder: (entityId: string) => DraggableColumnKey[];
}

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set, get) => ({
      showWeekends: true,
      showLabels: true,
      colorBy: 'status' as const,
      zoomLevel: 36,
      rowHeight: 40,
      boardColumnsByEntity: {},
      columnOrderByEntity: {},

      setShowWeekends: (show) => set({ showWeekends: show }),
      toggleWeekends: () => set((s) => ({ showWeekends: !s.showWeekends })),
      setShowLabels: (show) => set({ showLabels: show }),
      setColorBy: (by) => set({ colorBy: by }),
      setZoomLevel: (level) => set({ zoomLevel: level }),
      setRowHeight: (height) => set({ rowHeight: height }),
      setBoardColumns: (entityId, columns) =>
        set((s) => ({
          boardColumnsByEntity: { ...s.boardColumnsByEntity, [entityId]: columns },
        })),
      getBoardColumns: (entityId) => {
        return get().boardColumnsByEntity[entityId] || DEFAULT_BOARD_COLUMNS;
      },
      setColumnOrder: (entityId, order) =>
        set((s) => ({
          columnOrderByEntity: { ...s.columnOrderByEntity, [entityId]: order },
        })),
      getColumnOrder: (entityId) => {
        return get().columnOrderByEntity[entityId] || DEFAULT_COLUMN_ORDER;
      },
    }),
    {
      name: 'pmai_timeline',
    },
  ),
);
