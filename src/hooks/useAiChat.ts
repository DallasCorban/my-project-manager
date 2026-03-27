// useAiChat — manages AI conversation state, persistence, and API calls.
// Supports streaming via SSE with token-by-token display and model routing.

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  sendChatMessage,
  streamChatMessage,
  type ChatMessage,
  type BoardContext,
} from '../services/ai/chatService';
import type { Board } from '../types/board';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  model?: 'haiku' | 'sonnet';
}

interface AiChatState {
  messages: DisplayMessage[];
  isLoading: boolean;
  streamDone: boolean;
  error: string | null;
  model: 'haiku' | 'sonnet' | null;
  forceSonnet: boolean;
  setForceSonnet: (v: boolean) => void;
  sendMessage: (
    text: string,
    onStreamToken?: (token: string) => void,
    onStreamDone?: () => void,
    onComplete?: (fullResponse: string) => void,
  ) => Promise<void>;
  clearChat: () => Promise<void>;
}

/** Build a lightweight summary of the board for the AI system prompt. */
function buildBoardContext(project: Board): BoardContext {
  const statusBreakdown: Record<string, number> = {};
  for (const task of project.tasks) {
    statusBreakdown[task.status] = (statusBreakdown[task.status] || 0) + 1;
  }
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    groups: project.groups.map((g) => ({ id: g.id, name: g.name })),
    tasks: project.tasks.map((t) => ({
      id: t.id,
      groupId: t.groupId,
      name: t.name,
      status: t.status,
      assignees: t.assignees || [],
      start: t.start,
      duration: t.duration,
      priority: t.priority || '',
      subitemCount: t.subitems?.length || 0,
    })),
    statusBreakdown,
  };
}

export function useAiChat(project: Board | null): AiChatState {
  const projectId = project?.id ?? null;
  const projectRef = useRef(project);
  projectRef.current = project;
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  const [model, setModel] = useState<'haiku' | 'sonnet' | null>(null);
  const [forceSonnet, setForceSonnet] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Guard against state updates after unmount
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Track whether the current response was streamed (skip auto-speak)
  const wasStreamedRef = useRef(false);
  // Track active streaming to block Firestore overwrites
  const isStreamingRef = useRef(false);

  // Subscribe to Firestore for chat history
  useEffect(() => {
    if (!projectId || !db) return;

    const chatRef = doc(db, 'projects', projectId, 'aiChat', 'current');
    const unsub = onSnapshot(
      chatRef,
      (snap) => {
        if (!mountedRef.current) return;
        if (!snap.exists()) {
          if (!isStreamingRef.current) setMessages([]);
          return;
        }
        const data = snap.data();
        if (data?.messages) {
          // Only update from Firestore if we're NOT actively streaming
          if (!isStreamingRef.current && !isLoadingRef.current) {
            setMessages(data.messages as DisplayMessage[]);
          }
        }
      },
      (err) => {
        console.warn('AI chat listener error:', err);
      },
    );

    return unsub;
  }, [projectId]);

  // Persist messages to Firestore
  const persistMessages = useCallback(
    async (msgs: DisplayMessage[]) => {
      if (!projectId || !db) return;
      const chatRef = doc(db, 'projects', projectId, 'aiChat', 'current');
      const cleaned = msgs.map(({ toolCalls, model: m, ...rest }) => {
        const msg: Record<string, unknown> = { ...rest };
        if (toolCalls) msg.toolCalls = toolCalls;
        if (m) msg.model = m;
        return msg;
      });
      await setDoc(chatRef, {
        messages: cleaned,
        updatedAt: new Date().toISOString(),
      });
    },
    [projectId],
  );

  const sendMessage = useCallback(
    async (
      text: string,
      onStreamToken?: (token: string) => void,
      onStreamDone?: () => void,
      onComplete?: (fullResponse: string) => void,
    ) => {
      if (!text.trim() || isLoadingRef.current) return;

      setError(null);
      setIsLoading(true);
      isLoadingRef.current = true;
      setModel(null);
      setStreamDone(false);
      wasStreamedRef.current = false;

      // Add user message optimistically
      const userMsg: DisplayMessage = {
        id: `m${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const assistantId = `m${Date.now() + 1}`;
      const updatedMessages = [...messagesRef.current, userMsg];
      setMessages(updatedMessages);

      // Accumulator ref for streaming content
      const contentRef = { current: '' };
      const modelRef = { current: null as 'haiku' | 'sonnet' | null };
      const assistantAdded = { current: false };
      // Track streaming state separately from isLoading (which controls loading dots)
      const streamingRef = { current: false };

      try {
        // Build history from the updated messages (includes user msg)
        const history: ChatMessage[] = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const boardCtx = projectRef.current
          ? buildBoardContext(projectRef.current)
          : undefined;

        const streamUrl = import.meta.env.VITE_AI_CHAT_STREAM_URL;

        let result;
        if (streamUrl) {
          // Streaming mode
          wasStreamedRef.current = true;
          isStreamingRef.current = true;
          result = await streamChatMessage(text.trim(), history, boardCtx, forceSonnet, {
            onToken: (token) => {
              contentRef.current += token;

              // Add assistant message on first token
              if (!assistantAdded.current) {
                assistantAdded.current = true;
                setIsLoading(false);
              }

              setMessages((prev) => {
                // If assistant message doesn't exist yet, add it
                if (prev[prev.length - 1]?.id !== assistantId) {
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: 'assistant' as const,
                      content: contentRef.current,
                      timestamp: new Date().toISOString(),
                      model: modelRef.current || undefined,
                    },
                  ];
                }
                // Otherwise update existing
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: contentRef.current,
                };
                return updated;
              });
              // Feed token to TTS pipeline
              onStreamToken?.(token);
            },
            onModel: (m) => {
              modelRef.current = m;
              setModel(m);
            },
            onTool: () => {
              // Tool calls happen during intermediate rounds
            },
          });
        } else {
          // Fallback: non-streaming
          result = await sendChatMessage(text.trim(), history, boardCtx);
        }

        // Build final assistant message
        const assistantMsg: DisplayMessage = {
          id: assistantId,
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
          model: modelRef.current || result.model || undefined,
        };

        // Signal stream done for TTS flush
        onStreamDone?.();
        // Signal completion with full response (for HD mode TTS)
        onComplete?.(result.response);

        const finalMessages = [...updatedMessages, assistantMsg];

        // Set local state first
        if (mountedRef.current) {
          setMessages(finalMessages);
          setIsLoading(false);
          setStreamDone(true);
        }
        isLoadingRef.current = false;

        // Persist to Firestore, then release streaming guard after write completes
        await persistMessages(finalMessages);
        // Small delay to let snapshot fire with our data before releasing guard
        setTimeout(() => {
          isStreamingRef.current = false;
        }, 500);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
          setIsLoading(false);
        }
        isLoadingRef.current = false;
        isStreamingRef.current = false;
      }
    },
    [persistMessages, forceSonnet],
  );

  const clearChat = useCallback(async () => {
    setMessages([]);
    setError(null);
    setModel(null);
    if (projectId && db) {
      const chatRef = doc(db, 'projects', projectId, 'aiChat', 'current');
      await deleteDoc(chatRef);
    }
  }, [projectId]);

  return {
    messages,
    isLoading,
    streamDone,
    error,
    model,
    forceSonnet,
    setForceSonnet,
    sendMessage,
    clearChat,
  };
}
