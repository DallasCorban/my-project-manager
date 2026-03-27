// Voice service — API clients for Deepgram STT, ElevenLabs TTS, and transcript ingestion.

import { auth } from '../../config/firebase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

/** Get the Deepgram API key for client-side WebSocket STT. */
export async function getDeepgramToken(): Promise<string> {
  const url = import.meta.env.VITE_DEEPGRAM_TOKEN_URL;
  if (!url) throw new Error('VITE_DEEPGRAM_TOKEN_URL not configured');

  const headers = await getAuthHeaders();
  const res = await fetch(url, { method: 'POST', headers });

  if (!res.ok) {
    throw new Error(`Failed to get Deepgram token (${res.status})`);
  }

  const data = (await res.json()) as { key: string };
  return data.key;
}

/** Send text to the TTS endpoint and return the audio response. */
export async function getElevenLabsSpeech(
  text: string,
  voiceId?: string
): Promise<Response> {
  const url = import.meta.env.VITE_TTS_URL;
  if (!url) throw new Error('VITE_TTS_URL not configured');

  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, voiceId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `TTS failed (${res.status})`);
  }

  return res;
}

/** Ingest a meeting transcript and extract structured facts. */
export async function ingestTranscript(
  transcript: string,
  projectId: string,
  workspaceId?: string
): Promise<{
  proposedFacts: Array<{ content: string; category: string }>;
  briefUpdate: string;
}> {
  const url = import.meta.env.VITE_INGEST_TRANSCRIPT_URL;
  if (!url) throw new Error('VITE_INGEST_TRANSCRIPT_URL not configured');

  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transcript, projectId, workspaceId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Transcript ingestion failed (${res.status})`);
  }

  return res.json();
}
