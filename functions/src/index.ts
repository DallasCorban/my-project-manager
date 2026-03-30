/**
 * Cloud Function entry points for the Flow AI system.
 */
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { verifyAuth } from "./middleware/auth";
import { runAgent, runAgentStreaming } from "./agent/agent";
import { heuristicCheck, classifyQuery } from "./agent/classifier";

admin.initializeApp();

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const deepgramApiKey = defineSecret("DEEPGRAM_API_KEY");
const elevenLabsApiKey = defineSecret("ELEVENLABS_API_KEY");

/**
 * POST /api/chat
 *
 * Body: { message: string, conversationHistory?: Array<{ role, content }>, projectContext?: string }
 *
 * Returns: { response: string, toolCalls: Array<{ name, input }> }
 */
export const chat = onRequest(
  {
    secrets: [anthropicApiKey],
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Authenticate
    const user = await verifyAuth(req, res);
    if (!user) return; // 401 already sent

    const { message, conversationHistory = [], boardContext, itemContext } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing or invalid 'message' field." });
      return;
    }

    try {
      // Sanitize boardContext — only pass if it's a valid object
      const sanitizedBoardContext =
        boardContext && typeof boardContext === "object" ? boardContext : undefined;
      const sanitizedItemContext =
        itemContext && typeof itemContext === "object" ? itemContext : undefined;

      const result = await runAgent(
        conversationHistory,
        message,
        user.uid,
        user.email || "unknown",
        anthropicApiKey.value(),
        sanitizedBoardContext,
        sanitizedItemContext,
      );

      res.status(200).json({
        response: result.response,
        toolCalls: result.toolCalls,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      console.error("Agent error:", errMsg, errStack);
      res.status(500).json({
        error: errMsg || "An error occurred while processing your request.",
      });
    }
  }
);

/**
 * POST /api/chatStream
 *
 * Streaming variant of /api/chat. Returns Server-Sent Events (SSE) with
 * progressive text deltas, tool call notifications, and a final done event.
 *
 * Body: { message, conversationHistory?, boardContext?, forceSonnet? }
 * SSE events: { type: "model"|"token"|"tool"|"done"|"error", ... }
 */
export const chatStream = onRequest(
  {
    secrets: [anthropicApiKey],
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const user = await verifyAuth(req, res);
    if (!user) return;

    const {
      message,
      conversationHistory = [],
      boardContext,
      forceSonnet = false,
      itemContext,
    } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing or invalid 'message' field." });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    const sendSSE = (data: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const sanitizedBoardContext =
        boardContext && typeof boardContext === "object" ? boardContext : undefined;
      const sanitizedItemContext =
        itemContext && typeof itemContext === "object" ? itemContext : undefined;

      // --- Model routing ---
      let modelChoice: "haiku" | "sonnet" = "sonnet";
      const heuristic = heuristicCheck(message, forceSonnet);
      if (heuristic) {
        modelChoice = heuristic as "sonnet";
      } else {
        const classification = await classifyQuery(
          message,
          anthropicApiKey.value()
        );
        modelChoice = classification === "simple" ? "haiku" : "sonnet";
      }

      sendSSE({ type: "model", model: modelChoice });

      // --- Streaming agent loop with retry on overloaded ---
      const tryStream = (model: string) =>
        runAgentStreaming(
          conversationHistory,
          message,
          user.uid,
          user.email || "unknown",
          anthropicApiKey.value(),
          sanitizedBoardContext,
          (token) => sendSSE({ type: "token", text: token }),
          (toolName) => sendSSE({ type: "tool", name: toolName }),
          model,
          sanitizedItemContext,
        );

      let result;
      try {
        result = await tryStream(modelChoice);
      } catch (retryErr: unknown) {
        const errMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (errMsg.includes("overloaded") || errMsg.includes("529")) {
          // Retry with the other model
          const fallback = modelChoice === "sonnet" ? "haiku" : "sonnet";
          sendSSE({ type: "model", model: fallback });
          result = await tryStream(fallback);
        } else {
          throw retryErr;
        }
      }

      sendSSE({
        type: "done",
        response: result.response,
        toolCalls: result.toolCalls,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Stream agent error:", errMsg);
      sendSSE({ type: "error", message: errMsg });
    } finally {
      res.end();
    }
  }
);

/**
 * POST /api/ingestTranscript
 *
 * Extracts structured facts from a meeting transcript using AI.
 * Returns proposed facts and brief update for user confirmation.
 *
 * Body: { transcript: string, projectId: string, workspaceId?: string }
 * Returns: { proposedFacts: Array<{ content, category }>, briefUpdate: string }
 */
export const ingestTranscript = onRequest(
  {
    secrets: [anthropicApiKey],
    cors: true,
    timeoutSeconds: 120,
    memory: "512MiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const user = await verifyAuth(req, res);
    if (!user) return;

    const { transcript, projectId } = req.body;

    if (!transcript || typeof transcript !== "string") {
      res.status(400).json({ error: "Missing or invalid 'transcript' field." });
      return;
    }
    if (!projectId || typeof projectId !== "string") {
      res.status(400).json({ error: "Missing or invalid 'projectId' field." });
      return;
    }

    try {
      const db = admin.firestore();

      // Load user preferences for custom categories
      let categories: string[] = [];
      const prefsSnap = await db
        .collection("users")
        .doc(user.uid)
        .collection("aiMemory")
        .doc("preferences")
        .get();
      if (prefsSnap.exists) {
        categories = (prefsSnap.data()?.factCategories as string[]) || [];
      }

      // Load existing project facts to avoid duplicates
      let existingFacts: string[] = [];
      const factsSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("aiMemory")
        .doc("facts")
        .get();
      if (factsSnap.exists) {
        existingFacts = ((factsSnap.data()?.facts as Array<{ content: string }>) || []).map(
          (f) => f.content
        );
      }

      // Load existing brief
      let existingBrief = "";
      const briefSnap = await db
        .collection("projects")
        .doc(projectId)
        .collection("aiMemory")
        .doc("brief")
        .get();
      if (briefSnap.exists) {
        existingBrief = (briefSnap.data()?.content as string) || "";
      }

      const categoryList =
        categories.length > 0
          ? categories.join(", ")
          : "general, budget, deadline, decision, client, preference, creative-direction, deliverable-details, key-contact, filming-date, filming-location";

      const client = new Anthropic({ apiKey: anthropicApiKey.value() });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: `You are an AI assistant that extracts structured information from meeting transcripts for a project management system.

Your job is to:
1. Extract individual facts/decisions/action items from the transcript
2. Categorize each fact using these categories: ${categoryList}
3. Generate an updated project brief that incorporates the new information

Available categories: ${categoryList}

Existing facts already stored (do NOT duplicate these):
${existingFacts.length > 0 ? existingFacts.map((f) => `- ${f}`).join("\n") : "(none)"}

Existing project brief:
${existingBrief || "(none)"}

Respond with valid JSON in this exact format:
{
  "proposedFacts": [
    { "content": "fact text here", "category": "category-name" }
  ],
  "briefUpdate": "Updated project brief incorporating new information in markdown format"
}

Only extract genuinely important information. Skip small talk, greetings, and trivial details.`,
        messages: [
          {
            role: "user",
            content: `Extract facts from this transcript:\n\n${transcript.slice(0, 50000)}`,
          },
        ],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && "text" in textBlock ? textBlock.text : "";

      // Parse the JSON response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        res.status(500).json({ error: "Failed to parse AI response." });
        return;
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        proposedFacts: Array<{ content: string; category: string }>;
        briefUpdate: string;
      };

      res.status(200).json(parsed);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Transcript ingestion error:", errMsg);
      res.status(500).json({ error: errMsg || "Failed to process transcript." });
    }
  }
);

/**
 * POST /api/digestFile
 *
 * Extracts content from an uploaded file for AI context.
 * - Audio (mp3, wav, m4a, etc.): Deepgram pre-recorded API with speaker diarization
 * - PDF: text extraction via pdf-parse
 * - TXT/MD/CSV: read as UTF-8
 *
 * Results are written to projects/{projectId}/fileDigests/{fileId} in Firestore.
 *
 * Body: { fileId, projectId, storagePath, fileType }
 */
export const digestFile = onRequest(
  {
    secrets: [deepgramApiKey],
    cors: true,
    timeoutSeconds: 300, // 5 min for large audio files
    memory: "1GiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const user = await verifyAuth(req, res);
    if (!user) return;

    const { fileId, projectId, storagePath, fileType } = req.body;

    if (!fileId || !projectId || !storagePath) {
      res.status(400).json({ error: "Missing required fields: fileId, projectId, storagePath" });
      return;
    }

    const firestore = admin.firestore();
    const digestRef = firestore
      .collection("projects")
      .doc(projectId)
      .collection("fileDigests")
      .doc(fileId);

    try {
      // Update status to processing
      await digestRef.set(
        { fileId, enabled: true, status: "processing" },
        { merge: true },
      );

      const mimeType = (fileType || "").toLowerCase();
      let extractedText = "";
      let speakerLabels: Record<string, string> | undefined;

      if (mimeType.startsWith("audio/")) {
        // ── Audio: Deepgram pre-recorded API ──
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        const [buffer] = await file.download();

        const dgResponse = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&diarize=true&smart_format=true&punctuate=true",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${deepgramApiKey.value()}`,
              "Content-Type": mimeType,
            },
            body: new Uint8Array(buffer),
          },
        );

        if (!dgResponse.ok) {
          const errText = await dgResponse.text();
          throw new Error(`Deepgram error (${dgResponse.status}): ${errText}`);
        }

        const dgResult = (await dgResponse.json()) as {
          results?: {
            channels?: Array<{
              alternatives?: Array<{
                paragraphs?: {
                  paragraphs?: Array<{
                    speaker?: number;
                    sentences?: Array<{ text?: string }>;
                  }>;
                };
              }>;
            }>;
          };
        };

        // Build transcript with speaker labels
        const paragraphs =
          dgResult.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs || [];
        const lines: string[] = [];
        const speakerSet = new Set<number>();

        for (const para of paragraphs) {
          const speaker = para.speaker ?? 0;
          speakerSet.add(speaker);
          const sentences = (para.sentences || []).map((s) => s.text || "").join(" ");
          if (sentences.trim()) {
            lines.push(`[Speaker ${speaker}]: ${sentences.trim()}`);
          }
        }

        extractedText = lines.join("\n\n");

        // Initialize speaker labels
        speakerLabels = {};
        for (const s of speakerSet) {
          speakerLabels[`Speaker ${s}`] = `Speaker ${s}`;
        }
      } else if (mimeType === "application/pdf") {
        // ── PDF: text extraction ──
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        const [buffer] = await file.download();
        const data = await pdfParse(buffer);
        extractedText = data.text;
      } else if (
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "text/csv" ||
        mimeType === "text/markdown"
      ) {
        // ── Text files: read as UTF-8 ──
        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        const [buffer] = await file.download();
        extractedText = buffer.toString("utf-8");
      } else {
        // Unsupported
        await digestRef.set(
          {
            fileId,
            enabled: true,
            status: "error",
            error: `Unsupported file type: ${mimeType}. Supported: audio/*, application/pdf, text/*`,
          },
          { merge: true },
        );
        res.status(200).json({ success: false, error: "Unsupported file type" });
        return;
      }

      // Write result
      await digestRef.set({
        fileId,
        enabled: true,
        status: "done",
        extractedText,
        speakerLabels: speakerLabels || null,
        extractedAt: new Date().toISOString(),
      });

      res.status(200).json({ success: true, textLength: extractedText.length });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("File digest error:", errMsg);

      // Update Firestore with error
      await digestRef.set(
        { fileId, enabled: true, status: "error", error: errMsg },
        { merge: true },
      ).catch(() => {});

      res.status(500).json({ error: errMsg });
    }
  },
);

/**
 * POST /api/deepgramToken
 *
 * Returns the Deepgram API key for client-side WebSocket STT.
 * Authenticated endpoint — requires Firebase ID token.
 */
export const deepgramToken = onRequest(
  {
    secrets: [deepgramApiKey],
    cors: true,
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const user = await verifyAuth(req, res);
    if (!user) return;

    res.status(200).json({ key: deepgramApiKey.value() });
  }
);

/**
 * POST /api/tts
 *
 * Proxies text-to-speech requests to ElevenLabs.
 * Streams audio/mpeg back to the client.
 *
 * Body: { text: string, voiceId?: string }
 */
export const tts = onRequest(
  {
    secrets: [elevenLabsApiKey],
    cors: true,
    timeoutSeconds: 60,
    memory: "256MiB",
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const user = await verifyAuth(req, res);
    if (!user) return;

    const { text, voiceId, previousText } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "Missing or invalid 'text' field." });
      return;
    }

    // Cost control: limit text length (v2)
    if (text.length > 5000) {
      res.status(400).json({ error: "Text too long (max 5000 characters)." });
      return;
    }

    try {
      const voice = voiceId || "56bWURjYFHyYyVf490Dp"; // Default: Emma
      const body: Record<string, unknown> = {
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.75,
        },
      };
      // Pass previous text for prosody continuity across chunks
      if (previousText && typeof previousText === "string") {
        body.previous_text = previousText;
      }
      const elevenLabsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsApiKey.value(),
          },
          body: JSON.stringify(body),
        }
      );

      if (!elevenLabsRes.ok) {
        const errText = await elevenLabsRes.text();
        console.error("ElevenLabs error:", errText);
        res.status(502).json({ error: "TTS service error." });
        return;
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Transfer-Encoding", "chunked");

      // Stream the audio response
      const reader = elevenLabsRes.body?.getReader();
      if (!reader) {
        res.status(502).json({ error: "No audio stream." });
        return;
      }

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };

      await pump();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("TTS error:", errMsg);
      res.status(500).json({ error: "TTS failed." });
    }
  }
);
