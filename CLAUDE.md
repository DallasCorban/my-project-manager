# Claude Code Instructions for Flow App

## Living Documentation

This project maintains two living documents that must be kept up to date:

### 1. PRODUCT_SPEC.md (root)
- Describes how every feature is meant to behave
- **When to update:** Whenever a feature is added, changed, or removed during a session
- **What to include:** User-facing behavior, not implementation details. Write it so someone with no code access could understand how the feature works.
- **Update the "Last updated" date** at the top when making changes

### 2. LESSONS_LEARNED.md (root)
- Single cumulative file of all lessons learned across every Claude Code session
- **When to update:** Append new lessons as they're discovered during a session — don't wait until the end
- **Format:** Add a date-stamped section header (e.g., `## 2026-03-29 — Feature Name`) then bullet points grouped by topic
- Focus on non-obvious insights: things that caused debugging time, surprising API behaviors, architectural decisions that worked (or didn't)
- Also save key lessons to the Claude memory system (`feedback_*.md` files) for cross-session recall

## Environment Setup

When working in a **worktree**, the `.env` file does not copy automatically. Required env vars beyond Firebase config:

```
VITE_AI_CHAT_URL
VITE_AI_CHAT_STREAM_URL
VITE_DEEPGRAM_TOKEN_URL
VITE_TTS_URL
VITE_INGEST_TRANSCRIPT_URL
```

These are set in Vercel for production. For local dev, pull them from Vercel:

**At the start of any session in a worktree**, check if `.env.local` exists. If not, run:
```bash
npx vercel env pull .env.local
```
This pulls the latest env vars from Vercel. The Vercel CLI is already installed and the project is linked.

If the user mentions they've updated env vars, re-run the pull command to get the latest.

## Key Architecture Notes

- **Frontend:** React + Vite SPA, Zustand for UI state, Firestore for persistence
- **AI Chat:** Streaming SSE via Cloud Functions, model routing (Haiku/Sonnet)
- **Voice:** Deepgram Nova-2 WebSocket STT, ElevenLabs Flash v2.5 TTS
- **Conversational mode:** Always-on mic with adaptive auto-submit timing (see PRODUCT_SPEC.md for behavior details)
