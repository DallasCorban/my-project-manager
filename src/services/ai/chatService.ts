// AI chat service — sends messages to the Cloud Function /api/chat endpoint.

import { auth } from '../../config/firebase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  response: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * Send a message to the AI chat endpoint.
 * Requires the user to be authenticated (uses Firebase ID token).
 */
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
    subitemCount: number;
  }>;
  statusBreakdown: Record<string, number>;
}

export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
  boardContext?: BoardContext,
): Promise<ChatResponse> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not authenticated');

  const idToken = await user.getIdToken();
  const chatUrl = import.meta.env.VITE_AI_CHAT_URL;
  if (!chatUrl) throw new Error('VITE_AI_CHAT_URL not configured');

  const res = await fetch(chatUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      message,
      conversationHistory,
      boardContext,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Chat request failed (${res.status})`);
  }

  return res.json() as Promise<ChatResponse>;
}
