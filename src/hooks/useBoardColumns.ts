// Column resize hook for the board table view.
// Handles mouse drag to resize column widths.

import { useRef, useCallback, useEffect } from 'react';
import type { BoardColumns } from '../types/timeline';

type ColumnKey = keyof BoardColumns;

export function useBoardColumns(
  columns: BoardColumns,
  onColumnsChange: (columns: BoardColumns) => void,
) {
  const resizingRef = useRef<{
    key: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleStartResize = useCallback(
    (key: ColumnKey, clientX: number) => {
      resizingRef.current = {
        key,
        startX: clientX,
        startWidth: columns[key],
      };
    },
    [columns],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key, startX, startWidth } = resizingRef.current;
      const delta = e.clientX - startX;
      const minWidth = key === 'select' ? 30 : 60;
      const newWidth = Math.max(minWidth, startWidth + delta);
      onColumnsChange({ ...columns, [key]: newWidth });
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [columns, onColumnsChange]);

  return { handleStartResize };
}
