// AiChatPanel — right-side collapsible panel for AI assistant chat.

import { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Wrench, Sparkles } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAiChat, type DisplayMessage } from '../../hooks/useAiChat';
import type { Board } from '../../types/board';

interface AiChatPanelProps {
  project: Board | null;
  onClose: () => void;
}

export function AiChatPanel({ project, onClose }: AiChatPanelProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const { messages, isLoading, error, sendMessage, clearChat } = useAiChat(project);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

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
          <button
            onClick={() => void clearChat()}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles size={32} className="text-purple-400/50 mb-3" />
            <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              Ask me about your project, create tasks, or get insights.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} darkMode={darkMode} />
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

        {error && (
          <div className="px-4 py-2.5 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
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
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────

function MessageBubble({ message, darkMode }: { message: DisplayMessage; darkMode: boolean }) {
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
        {/* Bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-purple-500 text-white rounded-tr-md'
              : darkMode
                ? 'bg-[#262b4d] text-gray-200 rounded-tl-md'
                : 'bg-gray-100 text-gray-800 rounded-tl-md'
          }`}
        >
          {message.content}
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
