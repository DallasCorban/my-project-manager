// CreateTeamModal — styled modal for creating a new team/organisation.

import { useState, useRef, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface CreateTeamModalProps {
  open: boolean;
  onClose: () => void;
  onCreateTeam: (name: string) => void;
  busy?: boolean;
}

export function CreateTeamModal({ open, onClose, onCreateTeam, busy }: CreateTeamModalProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    onCreateTeam(trimmed);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md mx-4 rounded-2xl shadow-2xl border overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
          darkMode
            ? 'bg-[#1c213e] border-[#323652] shadow-black/40'
            : 'bg-white border-gray-200 shadow-gray-300/40'
        }`}
      >
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 flex items-start justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              darkMode ? 'bg-blue-500/15' : 'bg-blue-50'
            }`}>
              <Users size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Create a team
              </h2>
              <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Collaborate with others in a shared workspace
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-2">
          <label className={`block text-xs font-medium mb-1.5 ${
            darkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Team name
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="e.g. Design Team, Marketing, Acme Corp"
            maxLength={60}
            className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-colors border ${
              darkMode
                ? 'bg-[#111322] border-[#323652] text-gray-200 placeholder-gray-600 focus:border-blue-500/60'
                : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'
            }`}
          />
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 mt-2 flex items-center justify-end gap-2.5 border-t ${
          darkMode ? 'border-[#323652]/60' : 'border-gray-100'
        }`}>
          <button
            onClick={onClose}
            disabled={busy}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              darkMode
                ? 'text-gray-400 hover:bg-white/5'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || busy}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
              name.trim() && !busy
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/25'
                : darkMode
                  ? 'bg-[#323652] text-gray-600 cursor-not-allowed'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {busy ? 'Creating...' : 'Create team'}
          </button>
        </div>
      </div>
    </div>
  );
}
