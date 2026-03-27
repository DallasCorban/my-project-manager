// useVoiceOutput — ElevenLabs TTS playback hook.
// Streams audio from the TTS Cloud Function and plays it via Web Audio API.

import { useState, useCallback, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { getElevenLabsSpeech } from '../services/ai/voiceService';

export interface UseVoiceOutputReturn {
  isSpeaking: boolean;
  isMuted: boolean;
  toggleMute: () => void;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

/** Strip markdown formatting for cleaner TTS output. */
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '') // headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code and code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '') // list markers
    .replace(/^\d+\.\s+/gm, '') // numbered lists
    .replace(/>\s+/g, '') // blockquotes
    .replace(/\n{2,}/g, '. ') // paragraph breaks to pauses
    .replace(/\n/g, ' ')
    .trim();
}

export function useVoiceOutput(): UseVoiceOutputReturn {
  const isMuted = useUIStore((s) => s.voiceMuted);
  const toggleMute = useUIStore((s) => s.toggleVoiceMute);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (isMuted || !text.trim()) return;

      // Stop any current playback
      stop();

      const cleanText = stripMarkdown(text);
      if (!cleanText) return;

      try {
        setIsSpeaking(true);
        const response = await getElevenLabsSpeech(cleanText);

        // Create a blob URL from the streamed audio
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
        };

        await audio.play();
      } catch (err) {
        // Silently fail — TTS is non-critical
        console.warn('TTS playback failed:', err);
        setIsSpeaking(false);
      }
    },
    [isMuted, stop]
  );

  return { isSpeaking, isMuted, toggleMute, speak, stop };
}
