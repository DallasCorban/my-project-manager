// AiChatCore — shared chat UI (messages, input, voice controls) used by both
// the global AiChatPanel and the item-level ItemAiChat component.
// Includes conversational voice mode with adaptive auto-submit timing.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Sparkles, Wrench, Mic, Volume2, VolumeX, Zap, X,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useVoiceOutput } from '../../hooks/useVoiceOutput';
import { useSentenceTTS } from '../../hooks/useSentenceTTS';
import type { DisplayMessage } from '../../hooks/useAiChat';

export interface AiChatCoreProps {
  messages: DisplayMessage[];
  isLoading: boolean;
  error: string | null;
  forceSonnet: boolean;
  onSetForceSonnet: (v: boolean) => void;
  onSendMessage: (
    text: string,
    onStreamToken?: (token: string) => void,
    onStreamDone?: () => void,
    onComplete?: (fullResponse: string) => void,
  ) => Promise<void>;
  onClearChat: () => Promise<void>;
  darkMode: boolean;
  emptyStateMessage?: string;
  emptyStateSubtext?: string;
  /** Extra elements rendered in the input area (e.g., transcript upload button) */
  inputPrefix?: React.ReactNode;
  /** Context badge shown above input (e.g., "5 updates, 2 files digested") */
  contextBadge?: string;
}

export function AiChatCore({
  messages,
  isLoading,
  error: externalError,
  forceSonnet,
  onSetForceSonnet,
  onSendMessage,
  darkMode,
  emptyStateMessage = 'Ask me about your project, create tasks, or get insights.',
  emptyStateSubtext = 'Tap the mic to use voice input.',
  inputPrefix,
  contextBadge,
}: AiChatCoreProps) {
  const [input, setInput] = useState('');
  const [silenceMsg, setSilenceMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Refs for conversational auto-submit (avoids stale closures)
  const isLoadingRef = useRef(isLoading);
  const pendingTextRef = useRef('');
  const lastTranscriptChangeRef = useRef(0);
  const hasFinalSinceSubmitRef = useRef(false);
  const endsWithSentenceRef = useRef(false);
  const sendFnRef = useRef<(text: string) => void>(() => {});
  // Generation counter: increments on every submit/cancel so stale stream
  // callbacks (feedToken, flush) from a previous response become no-ops
  const submitGenRef = useRef(0);

  const voiceOptions = useRef({
    onSilenceTimeout: () => setSilenceMsg('Mic closed due to inactivity.'),
  }).current;
  const voice = useVoiceInput(voiceOptions);
  const tts = useVoiceOutput();
  const sentenceTTS = useSentenceTTS();
  const qualityMode = useUIStore((s) => s.voiceQualityMode);
  const toggleQualityMode = useUIStore((s) => s.toggleVoiceQualityMode);

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update input field with live transcription + track for auto-submit
  useEffect(() => {
    if (voice.isRecording && voice.transcript) {
      setInput(voice.transcript);
      pendingTextRef.current = voice.transcript;
      lastTranscriptChangeRef.current = Date.now();
      // If user starts speaking while TTS is playing, cancel TTS immediately
      // and invalidate stale stream callbacks to prevent double playback
      if (sentenceTTS.isSpeaking || tts.isSpeaking) {
        submitGenRef.current++;
        sentenceTTS.cancel();
        tts.stop();
      }
    }
  }, [voice.isRecording, voice.transcript, sentenceTTS, tts]);

  // Track when Deepgram confirms a sentence is complete (is_final: true)
  // and whether it ends with sentence punctuation for adaptive timeout
  useEffect(() => {
    if (voice.isRecording && voice.finalTranscript) {
      hasFinalSinceSubmitRef.current = true;
      const trimmed = voice.finalTranscript.trim();
      endsWithSentenceRef.current = /[.!?]$/.test(trimmed);
    }
  }, [voice.isRecording, voice.finalTranscript]);

  // Keep refs in sync so the polling interval always reads fresh values
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => {
    sendFnRef.current = (text: string) => {
      if (!text || isLoading) return;
      // Increment generation so any in-flight stream callbacks from
      // a previous response become no-ops (prevents double TTS)
      const gen = ++submitGenRef.current;
      voice.resetTranscript();
      setInput('');
      sentenceTTS.cancel();
      tts.stop();
      if (tts.isMuted) {
        void onSendMessage(text);
      } else if (qualityMode) {
        void onSendMessage(text, undefined, undefined, (resp) => {
          if (submitGenRef.current === gen) void tts.speak(resp);
        });
      } else {
        void onSendMessage(
          text,
          (token) => { if (submitGenRef.current === gen) sentenceTTS.feedToken(token); },
          () => { if (submitGenRef.current === gen) sentenceTTS.flush(); },
        );
      }
    };
  }, [isLoading, onSendMessage, tts, sentenceTTS, qualityMode, voice]);

  // Cancel TTS if muted mid-stream
  useEffect(() => {
    if (tts.isMuted) {
      sentenceTTS.cancel();
    }
  }, [tts.isMuted, sentenceTTS]);

  // Conversational auto-submit: poll while recording.
  // Only submits when Deepgram has confirmed a sentence (is_final) AND
  // enough silence has passed. Adaptive timeout:
  //   - 1.5s if transcript ends with . ! ? (confident sentence boundary)
  //   - 3.5s otherwise (safe for thinking pauses mid-thought)
  useEffect(() => {
    if (!voice.isRecording) return;

    const interval = setInterval(() => {
      const text = pendingTextRef.current.trim();
      if (!text || !hasFinalSinceSubmitRef.current) return;
      const elapsed = Date.now() - lastTranscriptChangeRef.current;
      const timeout = endsWithSentenceRef.current ? 1500 : 3500;
      if (elapsed >= timeout && !isLoadingRef.current) {
        pendingTextRef.current = '';
        lastTranscriptChangeRef.current = 0;
        hasFinalSinceSubmitRef.current = false;
        endsWithSentenceRef.current = false;
        sendFnRef.current(text);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [voice.isRecording]);

  const handleSend = useCallback(async () => {
    // Clear pending auto-submit so it doesn't double-fire
    pendingTextRef.current = '';
    lastTranscriptChangeRef.current = 0;
    hasFinalSinceSubmitRef.current = false;
    if (voice.isRecording) {
      voice.stopRecording();
    }

    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');

    // Cancel any ongoing TTS and invalidate stale stream callbacks
    submitGenRef.current++;
    sentenceTTS.cancel();
    tts.stop();

    if (tts.isMuted) {
      await onSendMessage(text);
    } else if (qualityMode) {
      const gen = submitGenRef.current;
      await onSendMessage(text, undefined, undefined, (fullResponse) => {
        if (submitGenRef.current === gen) void tts.speak(fullResponse);
      });
    } else {
      const gen = submitGenRef.current;
      await onSendMessage(
        text,
        (token) => { if (submitGenRef.current === gen) sentenceTTS.feedToken(token); },
        () => { if (submitGenRef.current === gen) sentenceTTS.flush(); },
      );
    }
  }, [input, isLoading, onSendMessage, voice, tts, sentenceTTS, qualityMode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleMicToggle = () => {
    if (voice.isRecording) {
      // Clear pending auto-submit so the interval doesn't also fire
      pendingTextRef.current = '';
      lastTranscriptChangeRef.current = 0;
      hasFinalSinceSubmitRef.current = false;
      voice.stopRecording();
      setTimeout(() => {
        const text = input.trim();
        if (text && !isLoading) {
          setInput('');
          submitGenRef.current++;
          sentenceTTS.cancel();
          tts.stop();
          const gen = submitGenRef.current;
          if (tts.isMuted) {
            void onSendMessage(text);
          } else if (qualityMode) {
            void onSendMessage(text, undefined, undefined, (resp) => {
              if (submitGenRef.current === gen) void tts.speak(resp);
            });
          } else {
            void onSendMessage(
              text,
              (token) => { if (submitGenRef.current === gen) sentenceTTS.feedToken(token); },
              () => { if (submitGenRef.current === gen) sentenceTTS.flush(); },
            );
          }
        }
      }, 300);
    } else {
      setSilenceMsg(null);
      void voice.startRecording();
    }
  };

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles size={32} className="text-purple-400/50 mb-3" />
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {emptyStateMessage}
            </p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              {emptyStateSubtext}
            </p>
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

        {(externalError || voice.error) && (
          <div className="px-4 py-2.5 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            {externalError || voice.error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Silence timeout banner */}
      {silenceMsg && (
        <div className={`mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
          darkMode ? 'bg-yellow-500/10 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
        }`}>
          <span>{silenceMsg}</span>
          <button onClick={() => setSilenceMsg(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div
        className={`px-4 py-3 border-t shrink-0 ${
          darkMode ? 'border-white/10' : 'border-gray-200'
        }`}
      >
        {contextBadge && (
          <div className={`text-[10px] mb-1.5 px-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {contextBadge}
          </div>
        )}
        <div
          className={`flex items-end gap-2 rounded-xl border px-3 py-2 ${
            darkMode
              ? 'bg-[#262b4d] border-white/10 focus-within:border-purple-500/50'
              : 'bg-gray-50 border-gray-200 focus-within:border-purple-400'
          } transition-colors`}
        >
          {inputPrefix}

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

          {/* Mic button — not disabled during loading so conversational mode keeps working */}
          <button
            onClick={handleMicToggle}
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

        {/* Voice & model controls below input */}
        <div className="flex items-center gap-1.5 mt-2 px-1">
          {/* Force Sonnet toggle */}
          <button
            onClick={() => onSetForceSonnet(!forceSonnet)}
            className={`p-1 rounded-md transition-colors ${
              forceSonnet
                ? 'bg-orange-500/20 text-orange-400'
                : darkMode
                  ? 'hover:bg-white/10 text-gray-500'
                  : 'hover:bg-gray-100 text-gray-400'
            }`}
            title={forceSonnet ? 'Using Sonnet (click for Auto)' : 'Auto model (click to force Sonnet)'}
          >
            <Zap size={12} />
          </button>
          {/* Voice output toggle */}
          <button
            onClick={tts.toggleMute}
            className={`p-1 rounded-md transition-colors ${
              !tts.isMuted
                ? 'bg-purple-500/20 text-purple-400'
                : darkMode
                  ? 'hover:bg-white/10 text-gray-500'
                  : 'hover:bg-gray-100 text-gray-400'
            }`}
            title={tts.isMuted ? 'Enable voice output' : 'Mute voice output'}
          >
            {tts.isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          {/* Voice quality mode toggle */}
          {!tts.isMuted && (
            <button
              onClick={toggleQualityMode}
              className={`px-1.5 py-0.5 rounded-md transition-colors text-[8px] font-semibold uppercase tracking-wider ${
                qualityMode
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : darkMode
                    ? 'bg-white/5 text-gray-600 hover:bg-white/10'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              }`}
              title={qualityMode ? 'Quality mode (click for Fast)' : 'Fast mode (click for Quality)'}
            >
              {qualityMode ? 'HD' : 'Fast'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────

export function MessageBubble({
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
