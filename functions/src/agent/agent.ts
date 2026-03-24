/**
 * Agent orchestration loop — sends messages to Claude with tool definitions,
 * executes tool calls, and loops until the model produces a final text response.
 */
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt";
import { toolDefinitions, executeTool } from "./tools";

const MAX_TOOL_ROUNDS = 10;

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

interface AgentResult {
  response: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * Run the agent loop: send conversation to Claude, execute any tool calls,
 * feed results back, and repeat until we get a text response.
 */
export async function runAgent(
  conversationHistory: ChatMessage[],
  userMessage: string,
  uid: string,
  userEmail: string,
  apiKey: string,
  boardContext?: Record<string, unknown>
): Promise<AgentResult> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content as string,
    })),
    { role: "user", content: userMessage },
  ];

  const systemPrompt = buildSystemPrompt(userEmail, boardContext);
  const allToolCalls: AgentResult["toolCalls"] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    // Check if the response contains tool use
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls — return the text response
      const finalText = textBlocks.map((b) => b.text).join("\n");
      return { response: finalText, toolCalls: allToolCalls };
    }

    // There are tool calls — execute them and loop
    // First, add the assistant's response to messages
    messages.push({ role: "assistant", content: response.content });

    // Execute each tool call and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      allToolCalls.push({
        name: toolUse.name,
        input: toolUse.input as Record<string, unknown>,
      });

      let result: string;
      try {
        result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          uid,
          userEmail
        );
      } catch (err) {
        result = JSON.stringify({
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results as a user message
    messages.push({ role: "user", content: toolResults });
  }

  return {
    response:
      "I reached the maximum number of tool calls. Please try a simpler request.",
    toolCalls: allToolCalls,
  };
}
