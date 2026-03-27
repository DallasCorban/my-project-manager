/**
 * Cloud Function entry points for the Flow AI system.
 */
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { verifyAuth } from "./middleware/auth";
import { runAgent } from "./agent/agent";

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

    const { message, conversationHistory = [], boardContext } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing or invalid 'message' field." });
      return;
    }

    try {
      // Sanitize boardContext — only pass if it's a valid object
      const sanitizedBoardContext =
        boardContext && typeof boardContext === "object" ? boardContext : undefined;

      const result = await runAgent(
        conversationHistory,
        message,
        user.uid,
        user.email || "unknown",
        anthropicApiKey.value(),
        sanitizedBoardContext
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

    const { text, voiceId } = req.body;

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
      const elevenLabsRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsApiKey.value(),
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_flash_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
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
