// useSentenceTTS — buffers streaming tokens into sentences, fires TTS per
// sentence concurrently, and plays resulting audio blobs sequentially.

import { useRef, useState, useCallback } from 'react';
import { getElevenLabsSpeech } from '../services/ai/voiceService';
import { stripMarkdown } from '../utils/textUtils';

const MAX_CONCURRENT_TTS = 3;

// Sentence-ending pattern: . ! ? followed by whitespace/end, or double newline.
// Avoids splitting on common abbreviations and decimals.
const SENTENCE_END = /(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e))[.!?](?:\s|$)|\n\n/;

export interface UseSentenceTTSReturn {
  isSpeaking: boolean;
  feedToken: (token: string) => void;
  flush: () => void;
  cancel: () => void;
}

export function useSentenceTTS(): UseSentenceTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Sentence buffer accumulating streamed tokens
  const bufferRef = useRef('');
  // Queue of TTS audio blob promises for sequential playback
  const queueRef = useRef<Promise<Blob>[]>([]);
  // Number of TTS requests currently in-flight
  const inflightRef = useRef(0);
  // Whether playback loop is running
  const playingRef = useRef(false);
  // Current audio element for cancellation
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // AbortControllers for in-flight fetch requests
  const abortControllersRef = useRef<AbortController[]>([]);
  // Whether the stream has finished (flush called)
  const finishedRef = useRef(false);
  // Whether cancelled
  const cancelledRef = useRef(false);
  // Track previous sentence for prosody continuity
  const previousTextRef = useRef('');

  const enqueueSentence = useCallback((sentence: string) => {
    const clean = stripMarkdown(sentence).trim();
    if (!clean || clean.length < 2) return;

    // Capture previous text for this request
    const prevText = previousTextRef.current;
    previousTextRef.current = clean;

    // Wait for a slot if at max concurrency
    const doFetch = async (): Promise<Blob> => {
      while (inflightRef.current >= MAX_CONCURRENT_TTS) {
        await new Promise((r) => setTimeout(r, 50));
      }
      inflightRef.current++;
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      try {
        const response = await getElevenLabsSpeech(clean, undefined, prevText || undefined);
        return await response.blob();
      } finally {
        inflightRef.current--;
        abortControllersRef.current = abortControllersRef.current.filter(
          (c) => c !== controller
        );
      }
    };

    const promise = doFetch();
    queueRef.current.push(promise);

    // Start playback loop if not already running
    if (!playingRef.current) {
      playingRef.current = true;
      setIsSpeaking(true);
      void playLoop();
    }
  }, []);

  const playLoop = useCallback(async () => {
    let index = 0;
    while (true) {
      if (cancelledRef.current) break;

      if (index < queueRef.current.length) {
        try {
          const blob = await queueRef.current[index];
          if (cancelledRef.current) break;

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          await new Promise<void>((resolve, reject) => {
            audio.onended = () => {
              URL.revokeObjectURL(url);
              audioRef.current = null;
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              audioRef.current = null;
              resolve(); // Skip failed audio, don't block queue
            };
            audio.play().catch(reject);
          });
        } catch {
          // Skip playback errors
        }
        index++;
      } else if (finishedRef.current) {
        // Stream ended and all audio played
        break;
      } else {
        // Wait for more audio to be queued
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    playingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const feedToken = useCallback(
    (token: string) => {
      // Reset cancelled flag when a new stream starts feeding tokens
      cancelledRef.current = false;
      bufferRef.current += token;

      // Check for sentence boundaries
      while (true) {
        const match = SENTENCE_END.exec(bufferRef.current);
        if (!match) break;

        const endIndex = match.index + match[0].length;
        const sentence = bufferRef.current.slice(0, endIndex);
        bufferRef.current = bufferRef.current.slice(endIndex);

        enqueueSentence(sentence);
      }
    },
    [enqueueSentence]
  );

  const flush = useCallback(() => {
    // Send any remaining buffer text
    if (bufferRef.current.trim()) {
      enqueueSentence(bufferRef.current);
      bufferRef.current = '';
    }
    finishedRef.current = true;
  }, [enqueueSentence]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    // Abort in-flight TTS requests
    for (const controller of abortControllersRef.current) {
      controller.abort();
    }
    abortControllersRef.current = [];

    // Clear state — but keep cancelledRef TRUE so the async playLoop
    // sees it and exits. It gets reset in feedToken when a new stream starts.
    bufferRef.current = '';
    queueRef.current = [];
    inflightRef.current = 0;
    finishedRef.current = false;
    playingRef.current = false;
    previousTextRef.current = '';
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, feedToken, flush, cancel };
}
