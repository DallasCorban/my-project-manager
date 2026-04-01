// useVoiceInput — Deepgram real-time streaming STT via WebSocket.
// Captures microphone audio, streams to Deepgram Nova-2, returns live transcription.
// Conversational mode: AiChatCore watches finalTranscript and handles auto-submit.

import { useState, useCallback, useRef } from 'react';
import { getDeepgramToken } from '../services/ai/voiceService';

export interface UseVoiceInputOptions {
  /** How long (ms) the connection must be open before the silence watcher activates. Default 120_000 (2 min) */
  silenceWarmupMs?: number;
  /** How long (ms) of silence (after warmup) triggers auto-disconnect. Default 30_000 (30s) */
  silenceGraceMs?: number;
  /** Called when the silence timeout fires and the connection is closed */
  onSilenceTimeout?: () => void;
}

export interface UseVoiceInputReturn {
  isRecording: boolean;
  transcript: string;
  finalTranscript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  /** Reset accumulated transcript — call after auto-submitting to clear for next utterance */
  resetTranscript: () => void;
  /** Temporarily suppress audio being sent to Deepgram (e.g. while TTS is playing) */
  pauseSending: () => void;
  resumeSending: () => void;
  error: string | null;
}

export function useVoiceInput(options?: UseVoiceInputOptions): UseVoiceInputReturn {
  const silenceWarmupMs = options?.silenceWarmupMs ?? 120_000;
  const silenceGraceMs = options?.silenceGraceMs ?? 30_000;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const pausedRef = useRef(false);
  const lastSpeechRef = useRef<number>(Date.now());
  const recordingStartRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Accumulated final transcript as a ref so resetTranscript() can clear it from outside
  const accumulatedRef = useRef('');

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (contextRef.current && contextRef.current.state !== 'closed') {
      void contextRef.current.close();
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setIsRecording(false);
  }, []);

  /** Clear accumulated text and transcript state — for use after auto-submit.
   *  Also resets the silence timer since submitting a message counts as activity. */
  const resetTranscript = useCallback(() => {
    accumulatedRef.current = '';
    setFinalTranscript('');
    setTranscript('');
    // Submitting a message means the user is engaged (even if listening to AI response)
    // — reset silence timer so it doesn't cut off during AI playback
    lastSpeechRef.current = Date.now();
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setFinalTranscript('');
    accumulatedRef.current = '';
    pausedRef.current = false;

    try {
      // Get mic permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const apiKey = await getDeepgramToken();

      const wsUrl = new URL('wss://api.deepgram.com/v1/listen');
      wsUrl.searchParams.set('model', 'nova-2');
      wsUrl.searchParams.set('punctuate', 'true');
      wsUrl.searchParams.set('interim_results', 'true');
      wsUrl.searchParams.set('utterance_end_ms', '1500');
      wsUrl.searchParams.set('smart_format', 'true');
      wsUrl.searchParams.set('encoding', 'linear16');
      wsUrl.searchParams.set('sample_rate', '16000');
      wsUrl.searchParams.set('channels', '1');

      const ws = new WebSocket(wsUrl.toString(), ['token', apiKey]);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsRecording(true);
        recordingStartRef.current = Date.now();
        lastSpeechRef.current = Date.now();

        // Create AudioContext and processor to capture PCM audio
        const audioContext = new AudioContext({ sampleRate: 16000 });
        contextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        // Buffer size 4096 gives ~256ms chunks at 16kHz
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (pausedRef.current) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        // Safety watcher: activates after warmup, then disconnects on sustained silence
        silenceTimerRef.current = setInterval(() => {
          const now = Date.now();
          const connectedFor = now - recordingStartRef.current;
          const silentFor = now - lastSpeechRef.current;
          if (connectedFor > silenceWarmupMs && silentFor > silenceGraceMs) {
            cleanup();
            options?.onSilenceTimeout?.();
          }
        }, 5_000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            channel?: { alternatives?: Array<{ transcript?: string }> };
            is_final?: boolean;
          };

          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const text = alt.transcript || '';

            if (data.is_final && text.trim()) {
              accumulatedRef.current += (accumulatedRef.current ? ' ' : '') + text.trim();
              lastSpeechRef.current = Date.now();
              // Updating state triggers AiChatCore's auto-submit polling
              setFinalTranscript(accumulatedRef.current);
              setTranscript(accumulatedRef.current);
            } else if (text.trim()) {
              // Interim result — show accumulated + current interim
              setTranscript(accumulatedRef.current + (accumulatedRef.current ? ' ' : '') + text.trim());
            }
          }
        } catch {
          // Ignore parse errors for non-JSON messages
        }
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSED) {
          // WebSocket never reached OPEN — likely blocked by a corporate firewall/proxy (e.g. Zscaler)
          setError('Could not connect to voice service. If you\'re on a corporate network (VPN/firewall), the connection may be blocked — try on a personal network.');
        } else {
          setError('Voice connection error. Please try again.');
        }
        cleanup();
      };

      ws.onclose = () => {
        setIsRecording(false);
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone permission denied.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to start recording.');
      }
      cleanup();
    }
  }, [cleanup, silenceWarmupMs, silenceGraceMs, options]);

  const stopRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
    }
    cleanup();
  }, [cleanup]);

  const pauseSending = useCallback(() => { pausedRef.current = true; }, []);
  const resumeSending = useCallback(() => { pausedRef.current = false; }, []);

  return {
    isRecording,
    transcript,
    finalTranscript,
    startRecording,
    stopRecording,
    resetTranscript,
    pauseSending,
    resumeSending,
    error,
  };
}
