// SpeakerLabelEditor — allows users to relabel speaker names from audio transcriptions.
// E.g., "Speaker 0" → "John Smith", "Speaker 1" → "Sarah Chen"

import { useState } from 'react';
import { Check, User } from 'lucide-react';

interface SpeakerLabelEditorProps {
  speakerLabels: Record<string, string>;
  extractedText: string;
  onUpdateLabel: (speakerKey: string, newName: string) => void;
  darkMode: boolean;
}

export function SpeakerLabelEditor({
  speakerLabels,
  extractedText,
  onUpdateLabel,
  darkMode,
}: SpeakerLabelEditorProps) {
  // Detect speakers from transcript (e.g., [Speaker 0], [Speaker 1])
  const speakerKeys = Array.from(
    new Set(
      (extractedText.match(/\[Speaker \d+\]/g) || []).map((m) => m.slice(1, -1)),
    ),
  );

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (speakerKeys.length === 0) return null;

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditValue(speakerLabels[key] || '');
  };

  const handleSave = (key: string) => {
    if (editValue.trim()) {
      onUpdateLabel(key, editValue.trim());
    }
    setEditingKey(null);
  };

  return (
    <div className={`mt-2 rounded-lg p-2.5 ${
      darkMode ? 'bg-[#1e2340]/50' : 'bg-gray-50'
    }`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${
        darkMode ? 'text-gray-500' : 'text-gray-400'
      }`}>
        Speaker Labels
      </p>
      <div className="space-y-1.5">
        {speakerKeys.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <User size={11} className={darkMode ? 'text-gray-600' : 'text-gray-400'} />
            <span className={`text-[11px] shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {key}:
            </span>
            {editingKey === key ? (
              <div className="flex items-center gap-1 flex-1">
                <input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave(key);
                    if (e.key === 'Escape') setEditingKey(null);
                  }}
                  className={`flex-1 text-[11px] px-1.5 py-0.5 rounded outline-none border ${
                    darkMode
                      ? 'bg-[#262b4d] border-white/10 text-gray-200'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                  autoFocus
                  placeholder="Enter name..."
                />
                <button
                  onClick={() => handleSave(key)}
                  className={`p-0.5 rounded ${
                    darkMode ? 'hover:bg-white/10 text-emerald-400' : 'hover:bg-gray-100 text-emerald-600'
                  }`}
                >
                  <Check size={11} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleStartEdit(key)}
                className={`text-[11px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                  speakerLabels[key]
                    ? darkMode
                      ? 'text-purple-400 hover:bg-white/5'
                      : 'text-purple-600 hover:bg-gray-100'
                    : darkMode
                      ? 'text-gray-600 hover:text-gray-400 hover:bg-white/5 italic'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 italic'
                }`}
              >
                {speakerLabels[key] || 'Click to name'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
