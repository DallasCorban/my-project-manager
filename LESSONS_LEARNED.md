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

## 2026-04-01 — Text Selection Bug in Updates Panel

### Root Cause: Document-level `selectionchange` listener causing re-renders
- The Updates Panel had a `document.addEventListener('selectionchange', updateFmtState)` to sync the rich-text toolbar's bold/italic/underline state.
- This fired on **every** selection change anywhere in the document — including when the user tried to highlight text in posted update cards below the editor.
- `updateFmtState` called `setFmtState()` (React setState), triggering a re-render that destroyed the browser's native text selection. This made it look like the selection "disappeared on mouseup."

### Debugging approach
- CSS was a red herring at first — `user-select: text` was correctly applied and `getComputedStyle` confirmed it. Programmatic selection via `document.createRange()` also worked fine.
- `preventDefault` interception showed nothing was blocking mousedown.
- The key insight came from attaching a `selectionchange` listener and seeing the selection was empty even mid-drag — meaning something was clearing it in real-time, not just on mouseup.
- Tracing React props via `__reactProps` on ancestor elements didn't reveal the culprit because it was a `document.addEventListener` call, not a React prop.

### Fix
- Scoped the `selectionchange` handler: only call `setFmtState()` when `editorRef.current?.contains(sel.anchorNode)` — i.e., only when the selection is inside the contentEditable composer, not in the update feed.
- Also optimized the picker-close mousedown handler to use `setShowColorPicker((v) => v ? false : v)` to avoid no-op state updates that cause unnecessary re-renders.

### General lesson
- **Document-level event listeners that call setState are dangerous.** They fire on interactions anywhere in the page and cause re-renders that can break unrelated UI (like native text selection). Always scope them to the relevant DOM subtree.
- When debugging "selection disappears," check for `selectionchange` listeners first — they're the most common culprit in React apps because setState → re-render → selection cleared.

## 2026-04-05 — AI Tool Overhaul

### Architecture
- **Dual data source problem**: AI creates write to `hybridRef` (user artifact doc) but reads use `projects/{id}/state/main`. New read tools (`search_items`, `get_item_details`) read from hybridRef first to find items the AI just created.
- **Unified tools beat per-level tools**: Instead of `update_subitem` + `update_sub_subitem` + `delete_task` + `delete_subitem` + `delete_sub_subitem` (5 tools), unified `update_item` and `delete_item` that accept optional depth IDs keeps the tool count manageable and the AI model less confused.
- **The `findItem()` helper** centralizes hierarchy navigation — taskId → subitemId → subSubitemId — reusable across update, delete, and details tools.

### Key Design Decisions
- **`bulk_create_items` with `temp_id` system**: Lets the AI create parent + children in one call by using temporary IDs that resolve to real IDs in array order. Critical for staying under the 10-tool-round limit when creating deep hierarchies.
- **Board context: subitems array instead of subitemCount**: Gives the AI visibility into subitem names/status without needing a tool call. Token cost is ~30-50 per subitem, acceptable.
- **Legacy memory tools removed**: 5 tools (`save_memory`, `recall_memory`, `delete_memory`, `compact_memory`, `update_user_preferences`) removed in favor of the brief system. Net tool count stayed at 17 despite adding 6 new tools.

### What Prompted This
- The AI assistant itself identified the tooling gaps after struggling to create 25 nested items (25 separate API calls, couldn't find items it created, couldn't edit subitem dates). The biggest missing capability was `update_item` for subitems — the AI literally couldn't fix a wrong date on a deliverable.
