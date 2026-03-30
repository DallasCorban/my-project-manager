// BriefViewer — shows an AI-generated brief with an edit button.
// Used in the Brief tab (item sidebar) and the global AI panel.

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, Sparkles } from 'lucide-react';

interface BriefViewerProps {
  brief: string | null;
  onUpdate: (content: string) => Promise<void>;
  darkMode: boolean;
  label: string;
  emptyMessage?: string;
}

export function BriefViewer({
  brief,
  onUpdate,
  darkMode,
  label,
  emptyMessage = 'No brief yet. The AI will create one as it learns from your conversations.',
}: BriefViewerProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editing]);

  const handleSave = async () => {
    await onUpdate(draft);
    setEditing(false);
  };

  const handleStartEdit = () => {
    setDraft(brief || '');
    setEditing(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {label}
        </span>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => void handleSave()}
              className={`p-1 rounded transition-colors ${
                darkMode ? 'hover:bg-white/10 text-emerald-400' : 'hover:bg-gray-100 text-emerald-600'
              }`}
              title="Save"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className={`p-1 rounded transition-colors ${
                darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
              }`}
              title="Cancel"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
            }`}
            title="Edit brief"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="Write a brief..."
          className={`w-full resize-none rounded-lg px-3 py-2 text-xs leading-relaxed outline-none border ${
            darkMode
              ? 'bg-[#262b4d] border-white/10 text-gray-200 placeholder:text-gray-500'
              : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'
          }`}
          rows={4}
        />
      ) : brief ? (
        <div className={`rounded-lg px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
          darkMode ? 'bg-[#262b4d] text-gray-300' : 'bg-gray-50 text-gray-700'
        }`}>
          {brief}
        </div>
      ) : (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${
          darkMode ? 'bg-[#262b4d]/50' : 'bg-gray-50'
        }`}>
          <Sparkles size={12} className={`mt-0.5 shrink-0 ${darkMode ? 'text-purple-400/50' : 'text-purple-300'}`} />
          <span className={`text-xs italic ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            {emptyMessage}
          </span>
        </div>
      )}
    </div>
  );
}
