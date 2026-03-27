/**
 * Lightweight Haiku-based query classifier.
 * Determines whether a user message is "simple" (Haiku can handle)
 * or "complex" (needs Sonnet for deeper reasoning / tool use).
 */
import Anthropic from "@anthropic-ai/sdk";

const ACTION_KEYWORDS = [
  "create", "add", "update", "delete", "remove", "move",
  "assign", "mark", "change", "set", "rename", "schedule",
];

/**
 * Quick heuristic check before burning an API call.
 * Returns "sonnet" if obviously complex, otherwise null (run classifier).
 */
export function heuristicCheck(
  message: string,
  forceSonnet: boolean
): "sonnet" | null {
  if (forceSonnet) return "sonnet";

  const lower = message.toLowerCase();
  for (const keyword of ACTION_KEYWORDS) {
    // Match whole word boundaries
    if (new RegExp(`\\b${keyword}\\b`).test(lower)) return "sonnet";
  }

  return null; // needs classifier
}

/**
 * Call Haiku to classify a user message as simple or complex.
 * Simple → Haiku handles the response. Complex → Sonnet handles it.
 */
export async function classifyQuery(
  message: string,
  apiKey: string
): Promise<"simple" | "complex"> {
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      system:
        "Classify the user message as 'simple' or 'complex'. Respond with one word only.\n" +
        "complex = needs tool use (create/update/delete tasks), multi-step reasoning, project analysis, or data lookup.\n" +
        "simple = greetings, thanks, general questions, status checks, clarifications, short replies.",
      messages: [{ role: "user", content: message }],
    });

    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim().toLowerCase()
        : "complex";

    return text.startsWith("simple") ? "simple" : "complex";
  } catch {
    // On error, default to simple (Haiku) — faster and avoids cascading failures
    return "simple";
  }
}
