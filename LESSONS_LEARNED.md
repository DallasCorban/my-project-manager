# Flow App — Lessons Learned

> Cumulative log of lessons learned across all Claude Code sessions.
> Every session should append new lessons as they're discovered — don't wait until the end.

---

## 2026-03-27 — Voice AI Initial Build (Deepgram STT, ElevenLabs TTS, Claude Streaming)

### ElevenLabs Setup
- Free tier can't use library voices via API — only premade voices. Paid plan ($5/mo Starter) unlocks everything.
- Free tier blocks on "unusual activity" quickly — repeated test calls from Cloud Function IPs trigger abuse detection.
- API key is NOT the same as Key ID — the dashboard's "Copy Key ID" gives a different value. The real key is only shown once at creation.
- `eleven_flash_v2_5` is the best model for conversational AI — `eleven_v3` has 2-3x higher latency.
- Voice settings: stability 0.6 + similarity_boost 0.75 gives consistent but natural output.

### Streaming Architecture
- Sentence-level TTS chunking gives fast first-audio (~1-2s) but inconsistent voice quality between sentences.
- The `previous_text` parameter helps ElevenLabs maintain prosody continuity across chunks.
- Full-response TTS (HD mode) sounds better but adds 5-8s latency. Offer both as a toggle.
- Pipeline: Claude (SSE) → sentence buffer (regex split on `.!?\n\n`) → concurrent TTS (max 3 in-flight) → sequential audio playback queue.

### React Streaming + Firestore
- `mountedRef` guards kill streaming if component unmounts/remounts during API calls. Remove guards from streaming callbacks or use refs that survive remounts.
- Firestore snapshot listeners race with streaming state — use an `isStreamingRef` guard to block snapshot updates during active streaming.
- `isLoading` serves double duty (UI dots + "response complete" signal). Use separate signals: `isLoading` for UI, `streamDone`/`onComplete` callback for completion.
- The `onComplete` callback pattern is more reliable than `useEffect` watching `streamDone` for triggering post-stream actions.

### Claude API / Model Routing
- Haiku model ID: `claude-haiku-4-5-20251001` (NOT `20250404`). Wrong IDs return 404.
- Sonnet model ID: `claude-sonnet-4-20250514`.
- Add retry logic that falls back to the other model on overload errors.
- Classifier should default to Haiku on error — if the classifier fails, Sonnet likely will too.

### Firebase Cloud Functions
- Cold starts only after ~15min inactivity. `minInstances: 1` eliminates them (~$5/month).
- Firebase deploy caches aggressively — "No changes detected" doesn't mean your code is deployed.
- Always `npm run build` in functions directory before `firebase deploy`.
- After updating secrets, always redeploy the function.

### Deepgram STT
- WebSocket streaming with Nova-2 at 16kHz mono works well for conversational speech.
- `ScriptProcessorNode` deprecation warning is cosmetic — still works, but should eventually migrate to `AudioWorkletNode`.

---

## 2026-03-29 — Conversational Voice Mode (Always-On Mic, Adaptive Timing)

### Auto-Submit Architecture
- **Don't use React useEffect + setTimeout for debounce** — stale closures and effect timing make it unreliable for voice. A `setInterval` polling approach with refs is much more robust: store pending text and timestamps in refs, poll every 500ms, check elapsed time.
- **Callback refs for cross-hook communication are fragile** — passing callbacks from AiChatPanel into useVoiceInput via options creates deep closure chains that silently break. Moving the auto-submit logic to the component layer (polling `voice.transcript` changes via refs) is simpler and testable.
- Three different useEffect-based approaches failed silently before the polling approach worked.

### Adaptive Timing for Natural Conversation
- **Use Deepgram's punctuation as a confidence signal** — with `punctuate: true`, Deepgram adds `.!?` at sentence boundaries. Use this to adapt the timeout:
  - Ends with `.!?` → 1.5s timeout (confident sentence boundary, snappy response)
  - No sentence-ending punctuation → 3.5s timeout (user likely thinking mid-thought)
- **Require `is_final: true` before auto-submitting** — interim results fire constantly while speaking. Only start the submit timer after Deepgram confirms a phrase boundary.
- Fixed timeouts are either too aggressive (cuts off slow speakers) or too slow (feels unresponsive). Adaptive timing solved both.

### TTS Cancellation Bug (Double Playback)
- `useSentenceTTS.cancel()` set `cancelledRef = true` then immediately reset to `false` in the same synchronous call. The async `playLoop` (polling every 50ms) never saw `true`. After cancel, the old loop kept running. When new tokens arrived, a second loop started → two voices playing simultaneously.
- **Fix**: Leave `cancelledRef = true` after cancel. Reset to `false` in `feedToken()` when a genuinely new stream begins. Any async loop must have a cancellation mechanism that survives across event loop ticks.
- **Generation counter for stale callbacks** — when cancelling mid-stream, the old `sendMessage`'s `onStreamDone`/`flush` callback can fire after cancel and restart TTS. Use a generation counter — callbacks check their generation matches current before executing.

### Deepgram WebSocket Lifecycle
- **Pausing audio sends kills the WebSocket** — echo suppression that stops sending audio causes Deepgram to close the connection after ~10s of inactivity. Browser's built-in `echoCancellation: true` on getUserMedia is sufficient.
- **Mic button must not be disabled during AI responses** — in conversational mode, the user needs to keep the mic open while listening to the AI. Don't set `disabled={isLoading}` on the mic button.
- **Silence timeout must account for listening time** — reset `lastSpeechRef` when submitting a message (via `resetTranscript`), not just on speech detection. Otherwise the silence watcher cuts off during AI playback.

### Worktree + Environment Pitfalls
- Worktree `.env` files don't copy automatically. Cloud Function URLs (VITE_DEEPGRAM_TOKEN_URL, etc.) were only in Vercel, not in local `.env`. Always verify ALL required env vars are present.
- The dev server must run FROM the worktree directory. Running from the main project directory means worktree code changes aren't reflected.
- This caused 20+ minutes of "nothing works" debugging when the code was actually correct.
