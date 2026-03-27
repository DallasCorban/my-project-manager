// useAiChat — manages AI conversation state, persistence, and API calls.

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { sendChatMessage, type ChatMessage, type BoardContext } from '../services/ai/chatService';
import type { Board } from '../types/board';

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
}

interface AiChatState {
  messages: DisplayMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearChat: () => Promise<void>;
}

/**
 * Hook to manage AI chat state for a project.
 * Persists conversation to Firestore at projects/{projectId}/aiChat/current.
 */
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
  // Use a ref so sendMessage always has the latest board state without re-creating the callback
  const projectRef = useRef(project);
  projectRef.current = project;
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync so the callback always has latest values
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Guard against state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Subscribe to Firestore for chat history
  useEffect(() => {
    if (!projectId || !db) return;

    const chatRef = doc(db, 'projects', projectId, 'aiChat', 'current');
    const unsub = onSnapshot(
      chatRef,
      (snap) => {
        if (!mountedRef.current) return;
        if (!snap.exists()) {
          setMessages([]);
          return;
        }
        const data = snap.data();
        if (data?.messages) {
          setMessages(data.messages as DisplayMessage[]);
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
      // Strip undefined fields — Firestore rejects them
      const cleaned = msgs.map(({ toolCalls, ...rest }) =>
        toolCalls ? { ...rest, toolCalls } : rest,
      );
      await setDoc(chatRef, {
        messages: cleaned,
        updatedAt: new Date().toISOString(),
      });
    },
    [projectId],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoadingRef.current) return;

      setError(null);
      setIsLoading(true);
      isLoadingRef.current = true;

      // Add user message optimistically
      const userMsg: DisplayMessage = {
        id: `m${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...messagesRef.current, userMsg];
      setMessages(updatedMessages);

      try {
        // Build conversation history for the API (only role + content)
        const history: ChatMessage[] = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Send all but the last message as history, and the last as the new message
        const historyForApi = history.slice(0, -1);
        const boardCtx = projectRef.current ? buildBoardContext(projectRef.current) : undefined;
        const result = await sendChatMessage(text.trim(), historyForApi, boardCtx);

        const assistantMsg: DisplayMessage = {
          id: `m${Date.now() + 1}`,
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
        };

        const finalMessages = [...updatedMessages, assistantMsg];
        // Always persist — even if component remounted, Firestore snapshot will pick it up
        await persistMessages(finalMessages);
        // Also set locally in case we're still mounted
        setMessages(finalMessages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [persistMessages],
  );

  // Clear only the conversation history — persistent AI memory
  // (projects/{id}/aiMemory/*) is intentionally preserved.
  const clearChat = useCallback(async () => {
    setMessages([]);
    setError(null);
    if (projectId && db) {
      const chatRef = doc(db, 'projects', projectId, 'aiChat', 'current');
      await deleteDoc(chatRef);
    }
  }, [projectId]);

  return { messages, isLoading, error, sendMessage, clearChat };
}
