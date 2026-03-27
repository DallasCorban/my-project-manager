// AiChatPanel — right-side collapsible panel for AI assistant chat
// with voice input (Deepgram STT), streaming voice output (ElevenLabs TTS),
// persistent memory viewer, and transcript upload.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Send, Trash2, Wrench, Sparkles, Brain, Zap,
  Mic, Volume2, VolumeX, FileText,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAiChat, type DisplayMessage } from '../../hooks/useAiChat';
import { useAiMemory } from '../../hooks/useAiMemory';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useVoiceOutput } from '../../hooks/useVoiceOutput';
import { useSentenceTTS } from '../../hooks/useSentenceTTS';
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
    messages, isLoading, streamDone, error, forceSonnet, setForceSonnet,
    sendMessage, clearChat,
  } = useAiChat(project);
  const memory = useAiMemory(project?.id ?? null, project?.workspaceId ?? null);
  const voice = useVoiceInput();
  const tts = useVoiceOutput();
  const sentenceTTS = useSentenceTTS();
  const qualityMode = useUIStore((s) => s.voiceQualityMode);
  const toggleQualityMode = useUIStore((s) => s.toggleVoiceQualityMode);

  const [input, setInput] = useState('');
  const [showMemory, setShowMemory] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update input field with live transcription
  useEffect(() => {
    if (voice.isRecording && voice.transcript) {
      setInput(voice.transcript);
    }
  }, [voice.isRecording, voice.transcript]);

  // Cancel TTS if muted mid-stream
  useEffect(() => {
    if (tts.isMuted) {
      sentenceTTS.cancel();
    }
  }, [tts.isMuted, sentenceTTS]);

  const handleSend = useCallback(async () => {
    if (voice.isRecording) {
      voice.stopRecording();
    }

    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');

    // Cancel any ongoing TTS before new message
    sentenceTTS.cancel();
    tts.stop();

    if (tts.isMuted) {
      await sendMessage(text);
    } else if (qualityMode) {
      // HD mode: wait for full response, then speak it all at once
      await sendMessage(text, undefined, undefined, (fullResponse) => {
        void tts.speak(fullResponse);
      });
    } else {
      // Fast mode: stream tokens to sentence TTS
      await sendMessage(
        text,
        (token) => sentenceTTS.feedToken(token),
        () => sentenceTTS.flush(),
      );
    }
  }, [input, isLoading, sendMessage, voice, tts, sentenceTTS, qualityMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleMicToggle = () => {
    if (voice.isRecording) {
      voice.stopRecording();
      setTimeout(() => {
        const text = input.trim();
        if (text && !isLoading) {
          setInput('');
          sentenceTTS.cancel();
          tts.stop();
          if (tts.isMuted) {
            void sendMessage(text);
          } else if (qualityMode) {
            void sendMessage(text, undefined, undefined, (resp) => void tts.speak(resp));
          } else {
            void sendMessage(
              text,
              (token) => sentenceTTS.feedToken(token),
              () => sentenceTTS.flush(),
            );
          }
        }
      }, 300);
    } else {
      void voice.startRecording();
    }
  };

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

  const totalFacts = memory.projectFacts.length + memory.workspaceFacts.length + memory.userFacts.length;

  // Loading dots show until first token arrives (isLoading is set to false on first token)

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
          {/* Force Sonnet toggle */}
          <button
            onClick={() => setForceSonnet(!forceSonnet)}
            className={`p-1.5 rounded-lg transition-colors ${
              forceSonnet
                ? 'bg-orange-500/20 text-orange-400'
                : darkMode
                  ? 'hover:bg-white/10 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-500'
            }`}
            title={forceSonnet ? 'Using Sonnet (click for Auto)' : 'Auto model (click to force Sonnet)'}
          >
            <Zap size={14} />
          </button>
          {/* Voice output toggle */}
          <button
            onClick={tts.toggleMute}
            className={`p-1.5 rounded-lg transition-colors ${
              !tts.isMuted
                ? 'bg-purple-500/20 text-purple-400'
                : darkMode
                  ? 'hover:bg-white/10 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-500'
            }`}
            title={tts.isMuted ? 'Enable voice output' : 'Mute voice output'}
          >
            {tts.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          {/* Voice quality mode toggle (only show when unmuted) */}
          {!tts.isMuted && (
            <button
              onClick={toggleQualityMode}
              className={`px-1.5 py-0.5 rounded-lg transition-colors text-[9px] font-semibold uppercase tracking-wider ${
                qualityMode
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : darkMode
                    ? 'bg-white/5 text-gray-500 hover:bg-white/10'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
              title={qualityMode ? 'Quality mode: full response before speaking (click for Fast)' : 'Fast mode: speaks as it streams (click for Quality)'}
            >
              {qualityMode ? 'HD' : 'Fast'}
            </button>
          )}
          {/* Memory toggle */}
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
            <Brain size={14} />
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
            title="Clear chat (memory is preserved)"
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
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Sparkles size={32} className="text-purple-400/50 mb-3" />
                <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Ask me about your project, create tasks, or get insights.
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                  Tap the mic to use voice input.
                </p>
                {totalFacts > 0 && (
                  <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    {totalFacts} fact{totalFacts !== 1 ? 's' : ''} in memory
                  </p>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                onReplay={msg.role === 'assistant' && msg.content ? () => void tts.speak(msg.content) : undefined}
              />
            ))}

            {isLoading && (
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0">
                  <Sparkles size={14} className="text-purple-400" />
                </div>
                <div
                  className={`rounded-2xl rounded-tl-md px-4 py-2.5 text-sm ${
                    darkMode ? 'bg-[#262b4d]' : 'bg-gray-100'
                  }`}
                >
                  <div className="flex gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {isIngesting && (
              <div className={`px-4 py-2.5 rounded-xl text-sm ${
                darkMode ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-600'
              }`}>
                Processing transcript...
              </div>
            )}

            {(error || voice.error) && (
              <div className="px-4 py-2.5 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                {error || voice.error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            className={`px-4 py-3 border-t shrink-0 ${
              darkMode ? 'border-white/10' : 'border-gray-200'
            }`}
          >
            <div
              className={`flex items-end gap-2 rounded-xl border px-3 py-2 ${
                darkMode
                  ? 'bg-[#262b4d] border-white/10 focus-within:border-purple-500/50'
                  : 'bg-gray-50 border-gray-200 focus-within:border-purple-400'
              } transition-colors`}
            >
              {/* Transcript upload */}
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

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voice.isRecording ? 'Listening...' : 'Ask anything...'}
                rows={1}
                className={`flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed max-h-32 ${
                  darkMode ? 'text-gray-200 placeholder:text-gray-500' : 'text-gray-800 placeholder:text-gray-400'
                }`}
                style={{
                  height: 'auto',
                  minHeight: '24px',
                }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                }}
              />

              {/* Mic button */}
              <button
                onClick={handleMicToggle}
                disabled={isLoading}
                className={`p-1.5 rounded-lg transition-all shrink-0 ${
                  voice.isRecording
                    ? 'bg-red-500 text-white animate-pulse'
                    : darkMode
                      ? 'hover:bg-white/10 text-gray-500'
                      : 'hover:bg-gray-100 text-gray-400'
                }`}
                title={voice.isRecording ? 'Stop recording & send' : 'Start voice input'}
              >
                <Mic size={14} />
              </button>

              {/* Send button */}
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim() || isLoading}
                className={`p-1.5 rounded-lg transition-all shrink-0 ${
                  input.trim() && !isLoading
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : darkMode
                      ? 'text-gray-600'
                      : 'text-gray-300'
                }`}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────

function MessageBubble({
  message,
  darkMode,
  onReplay,
}: {
  message: DisplayMessage;
  darkMode: boolean;
  onReplay?: () => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0">
          <Sparkles size={14} className="text-purple-400" />
        </div>
      )}

      <div className={`max-w-[85%] space-y-1.5 ${isUser ? 'items-end' : ''}`}>
        {/* Model badge */}
        {!isUser && message.model && (
          <span
            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider ${
              message.model === 'haiku'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-orange-500/15 text-orange-400'
            }`}
          >
            {message.model}
          </span>
        )}

        {/* Bubble */}
        <div
          className={`group relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-purple-500 text-white rounded-tr-md'
              : darkMode
                ? 'bg-[#262b4d] text-gray-200 rounded-tl-md'
                : 'bg-gray-100 text-gray-800 rounded-tl-md'
          }`}
        >
          {message.content || (
            <span className={darkMode ? 'text-gray-500' : 'text-gray-400'}>...</span>
          )}
          {/* Replay button for assistant messages */}
          {onReplay && (
            <button
              onClick={onReplay}
              className={`absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
              }`}
              title="Replay"
            >
              <Volume2 size={11} />
            </button>
          )}
        </div>

        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] ${
              darkMode ? 'bg-white/5 text-gray-500' : 'bg-gray-50 text-gray-400'
            }`}
          >
            <Wrench size={10} />
            <span>
              Used: {message.toolCalls.map((tc) => tc.name.replace(/_/g, ' ')).join(', ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
