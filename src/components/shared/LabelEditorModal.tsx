// Modal for managing status/type label definitions.
// Ported from App.jsx LabelEditorModal component.

import { X } from 'lucide-react';
import type { StatusLabel } from '../../config/constants';

interface LabelEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: StatusLabel[];
  onSave: (items: StatusLabel[]) => void;
  title: string;
  darkMode: boolean;
}

export function LabelEditorModal({
  isOpen,
  onClose,
  items,
  onSave,
  title,
  darkMode,
}: LabelEditorModalProps) {
  if (!isOpen) return null;

  const handleColorChange = (idx: number, color: string) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], color };
    onSave(newItems);
  };

  const handleLabelChange = (idx: number, label: string) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], label };
    onSave(newItems);
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-96 rounded-lg shadow-2xl p-6 ${
          darkMode ? 'bg-[#2b2c32] text-white' : 'bg-white text-gray-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">{title}</h3>
          <X
            className="cursor-pointer opacity-50 hover:opacity-100"
            onClick={onClose}
            size={20}
          />
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex gap-2 items-center">
              <input
                type="color"
                value={item.color}
                onChange={(e) => handleColorChange(idx, e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                type="text"
                value={item.label}
                onChange={(e) => handleLabelChange(idx, e.target.value)}
                className={`flex-1 px-2 py-1.5 rounded border ${
                  darkMode ? 'bg-[#181b34] border-[#3e3f4b]' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
