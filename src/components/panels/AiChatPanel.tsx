// AiChatPanel — global AI assistant panel (project-level).
// Thin wrapper around AiChatCore with header controls, brief viewer,
// and transcript upload.

import { useState, useRef } from 'react';
import {
  X, Trash2, Sparkles, FileText,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAiChat } from '../../hooks/useAiChat';
import { useAiMemory } from '../../hooks/useAiMemory';
import { AiChatCore } from './AiChatCore';
import { AiMemorySection } from './AiMemorySection';
import { ingestTranscript } from '../../services/ai/voiceService';
import type { Board } from '../../types/board';

interface AiChatPanelProps {
  project: Board | null;
  onClose: () => void;
}

export function AiChatPanel({ project, onClose }: AiChatPanelProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const {
    messages, isLoading, error, forceSonnet, setForceSonnet,
    sendMessage, clearChat,
  } = useAiChat(project);
  const memory = useAiMemory(project?.id ?? null, project?.workspaceId ?? null);

  const [showMemory, setShowMemory] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalFacts = memory.projectFacts.length + memory.workspaceFacts.length + memory.userFacts.length;

  const handleTranscriptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    try {
      setIsIngesting(true);
      const text = await file.text();
      const result = await ingestTranscript(text, project.id, project.workspaceId);

      const factsSummary = result.proposedFacts
        .map((f) => `- **${f.category}**: ${f.content}`)
        .join('\n');

      await sendMessage(
        `I uploaded a transcript. Here are the extracted facts to save:\n\n${factsSummary}\n\nPlease save each of these facts to project memory using the appropriate categories. Also update the project brief with this summary:\n\n${result.briefUpdate}`,
      );
    } catch (err) {
      console.error('Transcript upload error:', err);
    } finally {
      setIsIngesting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const transcriptUploadButton = (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading || isIngesting}
        className={`p-1.5 rounded-lg transition-colors shrink-0 ${
          darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
        }`}
        title="Upload transcript"
      >
        <FileText size={14} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.srt,.vtt"
        onChange={(e) => void handleTranscriptUpload(e)}
        className="hidden"
      />
    </>
  );

  return (
    <div
      className={`flex flex-col h-full ${
        darkMode ? 'bg-[#1c213e] text-gray-200' : 'bg-white text-gray-800'
      }`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-5 py-3.5 border-b shrink-0 ${
          darkMode ? 'border-white/10' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles size={18} className="text-purple-400" />
          <h2 className="text-sm font-semibold">AI Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
          {/* Memory toggle (kept for backward compat — will be replaced by BriefViewer in Phase 2) */}
          <button
            onClick={() => setShowMemory(!showMemory)}
            className={`p-1.5 rounded-lg transition-colors relative ${
              showMemory
                ? 'bg-purple-500/20 text-purple-400'
                : darkMode
                  ? 'hover:bg-white/10 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-500'
            }`}
            title={showMemory ? 'Hide memory' : 'Show memory'}
          >
            <FileText size={14} />
            {totalFacts > 0 && !showMemory && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-purple-500 text-white text-[8px] flex items-center justify-center font-bold">
                {totalFacts > 99 ? '99' : totalFacts}
              </span>
            )}
          </button>
          {/* Clear chat */}
          <button
            onClick={() => void clearChat()}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
            title="Clear chat (briefs are preserved)"
          >
            <Trash2 size={14} />
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {showMemory ? (
        <AiMemorySection memory={memory} darkMode={darkMode} />
      ) : (
        <>
          {isIngesting && (
            <div className={`px-5 py-2.5 text-sm ${
              darkMode ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-600'
            }`}>
              Processing transcript...
            </div>
          )}
          <AiChatCore
            messages={messages}
            isLoading={isLoading}
            error={error}
            forceSonnet={forceSonnet}
            onSetForceSonnet={setForceSonnet}
            onSendMessage={sendMessage}
            onClearChat={clearChat}
            darkMode={darkMode}
            inputPrefix={transcriptUploadButton}
          />
        </>
      )}
    </div>
  );
}
