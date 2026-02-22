// Label dropdown — unified Status/Type picker with portal rendering.
// Features: click-outside dismissal, Escape key, inline add/delete.
// Renders via React Portal to avoid overflow clipping.

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { MONDAY_PALETTE } from '../../config/constants';
import type { StatusLabel } from '../../config/constants';

interface LabelDropdownProps {
  labels: StatusLabel[];
  currentId: string;
  onSelect: (id: string) => void;
  darkMode: boolean;
  onAddLabel?: (label: string, color: string) => void;
  onRemoveLabel?: (id: string) => void;
  title?: string;
  addPlaceholder?: string;
  /** Anchor element ref for positioning the portal */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function LabelDropdown({
  labels,
  currentId,
  onSelect,
  darkMode,
  onAddLabel,
  onRemoveLabel,
  title = 'Status',
  addPlaceholder = 'New label…',
  anchorRef,
}: LabelDropdownProps) {
  const [newLabel, setNewLabel] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newColor, setNewColor] = useState<string>(
    MONDAY_PALETTE[labels.length % MONDAY_PALETTE.length] || '#579bfc',
  );

  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeStatusMenu = useCallback(() => {
    // Close via uiStore
    import('../../stores/uiStore').then(({ useUIStore }) => {
      useUIStore.getState().closeStatusMenu();
    });
  }, []);

  // Click-outside to close
  useClickOutside(dropdownRef, closeStatusMenu, true);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') closeStatusMenu();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeStatusMenu]);

  const commitAdd = () => {
    const label = newLabel.trim();
    if (!label || !onAddLabel) return;
    onAddLabel(label, newColor);
    setNewLabel('');
    setShowAdd(false);
    setNewColor(MONDAY_PALETTE[(labels.length + 1) % MONDAY_PALETTE.length] || '#579bfc');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitAdd();
    if (e.key === 'Escape') {
      setShowAdd(false);
      setNewLabel('');
    }
  };

  // Calculate position from anchor
  const getPosition = (): React.CSSProperties => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      return {
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        zIndex: 9999,
      };
    }
    // Fallback: position relative (non-portal usage)
    return { position: 'absolute', top: '100%', left: 0, zIndex: 9999 };
  };

  const dropdown = (
    <div
      ref={dropdownRef}
      className={`w-56 rounded-xl shadow-2xl border overflow-hidden ${
        darkMode ? 'bg-[#161a33] border-[#2a2d44]' : 'bg-white border-gray-200'
      }`}
      style={getPosition()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className={`px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}
      >
        {title}
      </div>

      {/* Options list */}
      <div className="py-1 max-h-56 overflow-y-auto">
        {labels.map((s) => {
          const isCurrent = s.id === currentId;
          return (
            <div
              key={s.id}
              className={`mx-1.5 my-0.5 px-2.5 py-1.5 text-xs font-medium cursor-pointer flex items-center gap-2 rounded-lg transition-colors group/label ${
                isCurrent
                  ? darkMode
                    ? 'bg-blue-500/20 text-white'
                    : 'bg-blue-50 text-blue-700'
                  : darkMode
                    ? 'hover:bg-[#0f1224] text-gray-200'
                    : 'hover:bg-gray-50 text-gray-700'
              }`}
              onClick={() => {
                onSelect(s.id);
                closeStatusMenu();
              }}
            >
              <div
                className="w-3 h-3 rounded-sm shrink-0 ring-1 ring-white/20"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate">{s.label}</span>
              {isCurrent && <Check size={12} className="opacity-70 shrink-0" />}
              {/* Delete button (hidden until hover, only for non-default) */}
              {onRemoveLabel && !isCurrent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveLabel(s.id);
                  }}
                  className="opacity-0 group-hover/label:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-all shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Inline add label */}
      <div className={`px-2.5 py-2 border-t ${darkMode ? 'border-[#2a2d44]' : 'border-gray-100'}`}>
        {showAdd ? (
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer shrink-0"
            />
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={addPlaceholder}
              className={`flex-1 h-7 px-2 rounded text-xs outline-none border ${
                darkMode
                  ? 'bg-[#0f1224] border-[#2a2d44] text-gray-200 placeholder-gray-500'
                  : 'bg-gray-50 border-gray-200 text-gray-700 placeholder-gray-400'
              }`}
            />
            <button
              onClick={commitAdd}
              className="px-2 h-7 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-colors ${
              darkMode
                ? 'text-gray-400 hover:bg-[#0f1224] hover:text-gray-200'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Plus size={12} />
            Add {title}
          </button>
        )}
      </div>
    </div>
  );

  // Render via portal if we have an anchor ref
  if (anchorRef?.current) {
    return createPortal(dropdown, document.body);
  }

  // Fallback: render inline
  return dropdown;
}
