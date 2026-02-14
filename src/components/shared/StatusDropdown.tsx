// Status/Type dropdown picker with search and add functionality.
// Ported from TaskRow.jsx StatusDropdown / TypeDropdown components.
// Unified into a single component that handles both statuses and types.

import { useState, type KeyboardEvent } from 'react';
import { Check, Edit2 } from 'lucide-react';
import { MONDAY_PALETTE } from '../../config/constants';
import type { StatusLabel } from '../../config/constants';

interface LabelDropdownProps {
  labels: StatusLabel[];
  currentId: string;
  onSelect: (id: string) => void;
  darkMode: boolean;
  onEdit?: () => void;
  onAddLabel?: (label: string, color: string) => void;
  title?: string;
  addPlaceholder?: string;
  addButtonText?: string;
  manageText?: string;
}

export function LabelDropdown({
  labels,
  currentId,
  onSelect,
  darkMode,
  onEdit,
  onAddLabel,
  title = 'Status',
  addPlaceholder = 'New status…',
  addButtonText = 'Add Status',
  manageText = 'Manage Status Labels',
}: LabelDropdownProps) {
  const [query, setQuery] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<string>(
    MONDAY_PALETTE[labels.length % MONDAY_PALETTE.length] || '#579bfc',
  );

  const filtered = labels.filter((s) =>
    s.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const commitAdd = () => {
    const label = newLabel.trim();
    if (!label || !onAddLabel) return;
    onAddLabel(label, newColor);
    setNewLabel('');
    setQuery('');
    setNewColor(MONDAY_PALETTE[(labels.length + 1) % MONDAY_PALETTE.length] || '#579bfc');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitAdd();
  };

  return (
    <div
      className={`w-64 rounded-2xl shadow-2xl border overflow-hidden ${
        darkMode ? 'bg-[#161a33] border-[#2b2c32]' : 'bg-white border-gray-200'
      }`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className={`px-4 pt-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}
      >
        {title}
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className={`w-full h-8 px-2.5 rounded-md text-xs outline-none border ${
            darkMode
              ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
              : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
          }`}
        />
      </div>

      {/* Options list */}
      <div className="py-1 max-h-56 overflow-y-auto">
        {filtered.length === 0 && (
          <div className={`px-3 py-4 text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            No matches
          </div>
        )}
        {filtered.map((s) => {
          const isCurrent = s.id === currentId;
          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`mx-2 my-0.5 px-2.5 py-2 text-xs font-medium cursor-pointer flex items-center gap-2 rounded-lg transition-colors ${
                isCurrent
                  ? darkMode
                    ? 'bg-blue-500/20 text-white'
                    : 'bg-blue-50 text-blue-700'
                  : darkMode
                    ? 'hover:bg-[#0f1224] text-gray-200'
                    : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <div
                className="w-3.5 h-3.5 rounded-sm shrink-0 ring-1 ring-white/20"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1">{s.label}</span>
              {isCurrent && <Check size={12} className="opacity-70" />}
            </div>
          );
        })}
      </div>

      {/* Add new label */}
      <div className={`px-3 py-3 border-t ${darkMode ? 'border-[#2b2c32]' : 'border-gray-100'}`}>
        <div
          className={`text-[10px] font-semibold uppercase tracking-widest mb-2 ${
            darkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          Add Label
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={addPlaceholder}
            className={`flex-1 h-8 px-2.5 rounded-md text-xs outline-none border ${
              darkMode
                ? 'bg-[#0f1224] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
            }`}
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-8 h-8 rounded border-0 bg-transparent cursor-pointer"
          />
        </div>
        <button
          onClick={commitAdd}
          className={`mt-2 w-full h-8 rounded-md text-xs font-semibold transition-colors ${
            darkMode
              ? 'bg-blue-600/90 hover:bg-blue-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
          type="button"
        >
          {addButtonText}
        </button>
      </div>

      {/* Manage labels button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.();
        }}
        className={`w-full px-4 py-2.5 text-[11px] font-semibold border-t flex items-center gap-2 transition-colors ${
          darkMode
            ? 'border-[#2b2c32] text-blue-300 hover:bg-[#0f1224]'
            : 'border-gray-100 text-blue-600 hover:bg-gray-50'
        }`}
        type="button"
      >
        <Edit2 size={12} /> {manageText}
      </button>
    </div>
  );
}
