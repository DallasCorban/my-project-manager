// AI chat service — sends messages to the Cloud Function /api/chat endpoint.
// Supports both non-streaming (sendChatMessage) and streaming (streamChatMessage) modes.

import { auth } from '../../config/firebase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  response: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  model?: 'haiku' | 'sonnet';
}

export interface BoardContext {
  id: string;
  workspaceId: string;
  name: string;
  groups: Array<{ id: string; name: string }>;
  tasks: Array<{
    id: string;
    groupId: string;
    name: string;
    status: string;
    assignees: string[];
    start: string | null;
    duration: number | null;
    priority: string;
    subitems: Array<{ id: string; name: string; status: string }>;
  }>;
  statusBreakdown: Record<string, number>;
}

/**
 * Send a message to the AI chat endpoint (non-streaming fallback).
 */
export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
  boardContext?: BoardContext,
  itemContext?: Record<string, unknown>,
): Promise<ChatResponse> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not authenticated');

  const idToken = await user.getIdToken();
  const chatUrl = import.meta.env.VITE_AI_CHAT_URL;
  if (!chatUrl) throw new Error('VITE_AI_CHAT_URL not configured');

  const body: Record<string, unknown> = {
    message,
    conversationHistory,
    boardContext,
  };
  if (itemContext) body.itemContext = itemContext;

  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Chat request failed (${res.status})`);
  }

  return res.json() as Promise<ChatResponse>;
}

export interface StreamCallbacks {
  onToken: (text: string) => void;
  onModel: (model: 'haiku' | 'sonnet') => void;
  onTool: (name: string) => void;
}

/**
 * Stream a message from the AI chat endpoint via SSE.
 * Calls onToken for each text delta, onModel when model is selected,
 * and onTool for each tool call. Returns the final ChatResponse.
 */
export async function streamChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
  boardContext: BoardContext | undefined,
  forceSonnet: boolean,
  callbacks: StreamCallbacks,
  itemContext?: Record<string, unknown>,
): Promise<ChatResponse> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not authenticated');

  const idToken = await user.getIdToken();
  const streamUrl = import.meta.env.VITE_AI_CHAT_STREAM_URL;

  // Fall back to non-streaming if stream URL not configured
  if (!streamUrl) {
    return sendChatMessage(message, conversationHistory, boardContext, itemContext);
  }

  const body: Record<string, unknown> = {
    message,
    conversationHistory,
    boardContext,
    forceSonnet,
  };
  if (itemContext) body.itemContext = itemContext;

  const res = await fetch(streamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Chat stream failed (${res.status})`);
  }

  if (!res.body) {
    throw new Error('No response body for streaming');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResponse: ChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      try {
        const event = JSON.parse(jsonStr) as Record<string, unknown>;

        switch (event.type) {
          case 'model':
            callbacks.onModel(event.model as 'haiku' | 'sonnet');
            break;
          case 'token':
            callbacks.onToken(event.text as string);
            break;
          case 'tool':
            callbacks.onTool(event.name as string);
            break;
          case 'done':
            finalResponse = {
              response: event.response as string,
              toolCalls: (event.toolCalls as ChatResponse['toolCalls']) || [],
              model: undefined, // will be set by caller from onModel
            };
            break;
          case 'error':
            throw new Error(event.message as string);
        }
      } catch (err) {
        if (err instanceof Error && err.message !== jsonStr) throw err;
        // Skip malformed JSON lines
      }
    }
  }

  if (!finalResponse) {
    throw new Error('Stream ended without a done event');
  }

  return finalResponse;
}
