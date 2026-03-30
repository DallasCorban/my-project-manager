// useItemAiChat — manages AI conversation state scoped to a specific item.
// Separate chat history per item (stored in Firestore at itemChats/{compositeId}).
// Builds ItemContext with adaptive character budget for hierarchy context.

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  streamChatMessage,
  sendChatMessage,
  type ChatMessage,
  type BoardContext,
} from '../services/ai/chatService';
import { buildItemContext } from '../services/ai/itemContextBuilder';
import type { Board } from '../types/board';
import type { DigestedFile, HierarchyBrief } from '../types/itemContext';
import type { DisplayMessage } from './useAiChat';

export { type DisplayMessage };

interface UseItemAiChatParams {
  project: Board | null;
  taskId: string | null;
  subitemId: string | null;
  subSubitemId: string | null;
  digestedFiles: DigestedFile[];
  briefs: {
    currentItem: string | null;
    project: string | null;
    parents: HierarchyBrief[];
    children: Record<string, string>;
  };
}

interface ItemAiChatState {
  messages: DisplayMessage[];
  isLoading: boolean;
  streamDone: boolean;
  error: string | null;
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

/** Build composite ID for item-level chat storage. */
function buildCompositeId(
  taskId: string,
  subitemId: string | null,
  subSubitemId: string | null,
): string {
  if (subSubitemId && subitemId) return `${taskId}__${subitemId}__${subSubitemId}`;
  if (subitemId) return `${taskId}__${subitemId}`;
  return taskId;
}

/** Build a lightweight board summary for the AI system prompt. */
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

export function useItemAiChat(params: UseItemAiChatParams): ItemAiChatState {
  const { project, taskId, subitemId, subSubitemId, digestedFiles, briefs } = params;
  const projectId = project?.id ?? null;
  const projectRef = useRef(project);
  projectRef.current = project;

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [streamDone, setStreamDone] = useState(false);
  const [forceSonnet, setForceSonnet] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const isStreamingRef = useRef(false);

  // Stable refs for context that changes frequently
  const digestedFilesRef = useRef(digestedFiles);
  digestedFilesRef.current = digestedFiles;
  const briefsRef = useRef(briefs);
  briefsRef.current = briefs;

  const compositeId = taskId ? buildCompositeId(taskId, subitemId, subSubitemId) : null;

  // Subscribe to Firestore for per-item chat history
  useEffect(() => {
    if (!projectId || !compositeId || !db) return;

    const chatRef = doc(db, 'projects', projectId, 'itemChats', compositeId);
    const unsub = onSnapshot(
      chatRef,
      (snap) => {
        if (!mountedRef.current) return;
        if (!snap.exists()) {
          if (!isStreamingRef.current) setMessages([]);
          return;
        }
        const data = snap.data();
        if (data?.messages && !isStreamingRef.current && !isLoadingRef.current) {
          setMessages(data.messages as DisplayMessage[]);
        }
      },
      (err) => {
        console.warn('Item AI chat listener error:', err);
      },
    );

    return unsub;
  }, [projectId, compositeId]);

  // Persist messages to Firestore
  const persistMessages = useCallback(
    async (msgs: DisplayMessage[]) => {
      if (!projectId || !compositeId || !db) return;
      const chatRef = doc(db, 'projects', projectId, 'itemChats', compositeId);
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
    [projectId, compositeId],
  );

  const sendMessage = useCallback(
    async (
      text: string,
      onStreamToken?: (token: string) => void,
      onStreamDone?: () => void,
      onComplete?: (fullResponse: string) => void,
    ) => {
      if (!text.trim() || isLoadingRef.current || !projectRef.current || !taskId) return;

      setError(null);
      setIsLoading(true);
      isLoadingRef.current = true;
      setStreamDone(false);

      const userMsg: DisplayMessage = {
        id: `m${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const assistantId = `m${Date.now() + 1}`;
      const updatedMessages = [...messagesRef.current, userMsg];
      setMessages(updatedMessages);

      const contentRef = { current: '' };
      const modelRef = { current: null as 'haiku' | 'sonnet' | null };
      const assistantAdded = { current: false };

      try {
        const history: ChatMessage[] = updatedMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const boardCtx = projectRef.current
          ? buildBoardContext(projectRef.current)
          : undefined;

        // Build rich item context with adaptive budget
        const itemCtx = buildItemContext({
          project: projectRef.current,
          taskId,
          subitemId,
          subSubitemId,
          digestedFiles: digestedFilesRef.current,
          briefs: briefsRef.current,
        });

        const streamUrl = import.meta.env.VITE_AI_CHAT_STREAM_URL;

        let result;
        if (streamUrl) {
          isStreamingRef.current = true;
          result = await streamChatMessage(text.trim(), history, boardCtx, forceSonnet, {
            onToken: (token) => {
              contentRef.current += token;
              if (!assistantAdded.current) {
                assistantAdded.current = true;
                setIsLoading(false);
              }
              setMessages((prev) => {
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
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: contentRef.current,
                };
                return updated;
              });
              onStreamToken?.(token);
            },
            onModel: (m) => { modelRef.current = m; },
            onTool: () => {},
          }, itemCtx as unknown as Record<string, unknown>);
        } else {
          result = await sendChatMessage(text.trim(), history, boardCtx, itemCtx as unknown as Record<string, unknown>);
        }

        const assistantMsg: DisplayMessage = {
          id: assistantId,
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
          model: modelRef.current || result.model || undefined,
        };

        onStreamDone?.();
        onComplete?.(result.response);

        const finalMessages = [...updatedMessages, assistantMsg];

        if (mountedRef.current) {
          setMessages(finalMessages);
          setIsLoading(false);
          setStreamDone(true);
        }
        isLoadingRef.current = false;

        await persistMessages(finalMessages);
        setTimeout(() => { isStreamingRef.current = false; }, 500);
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
          setIsLoading(false);
        }
        isLoadingRef.current = false;
        isStreamingRef.current = false;
      }
    },
    [persistMessages, forceSonnet, taskId, subitemId, subSubitemId],
  );

  const clearChat = useCallback(async () => {
    setMessages([]);
    setError(null);
    if (projectId && compositeId && db) {
      const chatRef = doc(db, 'projects', projectId, 'itemChats', compositeId);
      await deleteDoc(chatRef);
    }
  }, [projectId, compositeId]);

  return {
    messages,
    isLoading,
    streamDone,
    error,
    forceSonnet,
    setForceSonnet,
    sendMessage,
    clearChat,
  };
}
