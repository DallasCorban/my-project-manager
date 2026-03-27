// useVoiceInput — Deepgram real-time streaming STT via WebSocket.
// Captures microphone audio, streams to Deepgram Nova-2, returns live transcription.

import { useState, useCallback, useRef } from 'react';
import { getDeepgramToken } from '../services/ai/voiceService';

export interface UseVoiceInputReturn {
  isRecording: boolean;
  transcript: string;
  finalTranscript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  error: string | null;
}

export function useVoiceInput(): UseVoiceInputReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const cleanup = useCallback(() => {
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

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setFinalTranscript('');

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

      // Get Deepgram API key
      const apiKey = await getDeepgramToken();

      // Open WebSocket to Deepgram
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

      let accumulated = '';

      ws.onopen = () => {
        setIsRecording(true);

        // Create AudioContext and processor to capture PCM audio
        const audioContext = new AudioContext({ sampleRate: 16000 });
        contextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        // Use ScriptProcessorNode (deprecated but widely supported)
        // Buffer size 4096 gives ~256ms chunks at 16kHz
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          // Convert float32 to int16
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            channel?: {
              alternatives?: Array<{ transcript?: string }>;
            };
            is_final?: boolean;
          };

          if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
            const alt = data.channel.alternatives[0];
            const text = alt.transcript || '';

            if (data.is_final && text.trim()) {
              accumulated += (accumulated ? ' ' : '') + text.trim();
              setFinalTranscript(accumulated);
              setTranscript(accumulated);
            } else if (text.trim()) {
              // Interim result — show accumulated + current interim
              setTranscript(accumulated + (accumulated ? ' ' : '') + text.trim());
            }
          }
        } catch {
          // Ignore parse errors for non-JSON messages
        }
      };

      ws.onerror = () => {
        setError('Voice connection error. Please try again.');
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
  }, [cleanup]);

  const stopRecording = useCallback(() => {
    // Send close frame to Deepgram before cleanup
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
    }
    cleanup();
  }, [cleanup]);

  return {
    isRecording,
    transcript,
    finalTranscript,
    startRecording,
    stopRecording,
    error,
  };
}
