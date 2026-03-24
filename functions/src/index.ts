/**
 * Cloud Function entry points for the Flow AI system.
 */
import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { verifyAuth } from "./middleware/auth";
import { runAgent } from "./agent/agent";

admin.initializeApp();

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

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
