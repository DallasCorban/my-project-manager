// SelectionTray — fixed bottom-center bar for bulk actions on selected items.

import { Trash2, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useProjectData } from '../../stores/projectStore';

interface SelectionTrayProps {
  projectId: string;
}

export function SelectionTray({ projectId: _projectId }: SelectionTrayProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const { deleteSelection } = useProjectData();

  const count = selectedItems.size;
  if (count === 0) return null;

  const handleDelete = () => {
    deleteSelection(selectedItems);
    clearSelection();
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl transition-all duration-300 animate-slide-up ${
        darkMode
          ? 'bg-[#1c213e] border border-[#2b2c32] text-gray-200'
          : 'bg-white border border-gray-200 text-gray-700'
      }`}
      style={{
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <span className="text-sm font-medium">
        {count} item{count !== 1 ? 's' : ''} selected
      </span>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={handleDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors text-red-500 hover:bg-red-500/10"
      >
        <Trash2 size={14} />
        Delete
      </button>

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600" />

      <button
        onClick={clearSelection}
        className={`p-1.5 rounded-lg transition-colors ${
          darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
        }`}
        title="Clear selection"
      >
        <X size={14} />
      </button>
    </div>
  );
}
