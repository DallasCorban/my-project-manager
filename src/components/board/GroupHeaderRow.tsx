// Column header row for the board table view with resize handles.
// Ported from App.jsx GroupHeaderRow component.

import { Square } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { BoardColumns } from '../../types/timeline';

type ColumnKey = keyof BoardColumns;

interface GroupHeaderRowProps {
  boardColumns: BoardColumns;
  onStartResize: (key: ColumnKey, clientX: number) => void;
}

export function GroupHeaderRow({ boardColumns: col, onStartResize }: GroupHeaderRowProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  const handle = (key: ColumnKey) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartResize(key, e.clientX);
  };

  const resizerClass = `absolute right-0 top-0 bottom-0 w-1 cursor-col-resize ${
    darkMode ? 'hover:bg-blue-500/30' : 'hover:bg-blue-400/30'
  }`;

  const cellBase = `border-r flex items-center py-2 relative min-w-0 ${
    darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'
  }`;

  return (
    <div
      className={`flex border-b text-xs font-bold text-gray-500 uppercase tracking-wide ${
        darkMode ? 'bg-[#181b34] border-[#2b2c32]' : 'bg-white border-[#d0d4e4]'
      }`}
    >
      <div className={`${cellBase} justify-center`} style={{ width: col.select }}>
        <Square size={14} className="opacity-50" />
        <div className={resizerClass} onMouseDown={handle('select')} />
      </div>
      <div className={`${cellBase} px-4`} style={{ width: col.item }}>
        <span className="truncate">Item</span>
        <div className={resizerClass} onMouseDown={handle('item')} />
      </div>
      <div className={`${cellBase} px-4 justify-center`} style={{ width: col.person }}>
        <span className="truncate">Person</span>
        <div className={resizerClass} onMouseDown={handle('person')} />
      </div>
      <div className={`${cellBase} px-4 justify-center`} style={{ width: col.status }}>
        <span className="truncate">Status</span>
        <div className={resizerClass} onMouseDown={handle('status')} />
      </div>
      <div className={`${cellBase} px-4 justify-center`} style={{ width: col.type }}>
        <span className="truncate">Type</span>
        <div className={resizerClass} onMouseDown={handle('type')} />
      </div>
      <div className="px-4 py-2 flex items-center justify-center relative min-w-0" style={{ width: col.date }}>
        <span className="truncate">Date</span>
        <div className={resizerClass} onMouseDown={handle('date')} />
      </div>
    </div>
  );
}
