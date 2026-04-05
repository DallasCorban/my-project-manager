/**
 * Agent orchestration loop — sends messages to Claude with tool definitions,
 * executes tool calls, and loops until the model produces a final text response.
 *
 * Provides both non-streaming (runAgent) and streaming (runAgentStreaming) modes.
 */
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  type BriefsContext, type ItemContextPayload,
} from "./systemPrompt";
import { toolDefinitions, executeTool } from "./tools";

const MAX_TOOL_ROUNDS = 10;

const SONNET_MODEL = "claude-sonnet-4-20250514";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Anthropic.ContentBlock[];
}

interface AgentResult {
  response: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
}

interface ProjectBriefDoc {
  content: string;
  updatedAt: string;
  updatedBy: string;
}

const db = () => admin.firestore();

/**
 * Load briefs-based context (new system) from Firestore.
 */
async function loadBriefsContext(
  uid: string,
  projectId?: string,
  workspaceId?: string,
): Promise<BriefsContext> {
  const context: BriefsContext = {
    projectBrief: null,
    teamBrief: null,
    userBrief: null,
    itemBrief: null,
  };

  const promises: Promise<void>[] = [];

  // Project brief
  if (projectId) {
    promises.push(
      db()
        .collection("projects")
        .doc(projectId)
        .collection("aiMemory")
        .doc("brief")
        .get()
        .then((snap) => {
          if (snap.exists) {
            context.projectBrief = (snap.data() as ProjectBriefDoc)?.content || null;
          }
        })
        .catch(() => {}),
    );
  }

  // Team brief
  if (workspaceId) {
    promises.push(
      db()
        .collection("workspaceMemory")
        .doc(workspaceId)
        .get()
        .then((snap) => {
          if (snap.exists) {
            const data = snap.data();
            context.teamBrief = (data?.content as string) || null;
          }
        })
        .catch(() => {}),
    );
  }

  // User brief
  promises.push(
    db()
      .collection("users")
      .doc(uid)
      .collection("aiMemory")
      .doc("brief")
      .get()
      .then((snap) => {
        if (snap.exists) {
          context.userBrief = (snap.data() as ProjectBriefDoc)?.content || null;
        }
      })
      .catch(() => {}),
  );

  await Promise.all(promises);
  return context;
}

/**
 * Load item briefs for all non-done tasks in the project.
 * Used by board-level AI to have visibility into item-level context.
 */
async function loadActiveItemBriefs(
  boardContext?: Record<string, unknown>,
  projectId?: string,
): Promise<BriefsContext["activeItemBriefs"]> {
  if (!projectId || !boardContext) return undefined;

  const tasks = boardContext.tasks as Array<{
    id: string; name: string; status: string;
  }> | undefined;
  if (!tasks || tasks.length === 0) return undefined;

  // Filter to non-done tasks
  const activeTasks = tasks.filter((t) => t.status !== "done");
  if (activeTasks.length === 0) return undefined;

  // Fetch item briefs for active tasks (use task ID as composite ID for top-level items)
  const briefResults = await Promise.all(
    activeTasks.map(async (task) => {
      try {
        const snap = await db()
          .collection("projects")
          .doc(projectId)
          .collection("itemBriefs")
          .doc(task.id)
          .get();
        if (snap.exists) {
          const content = (snap.data() as { content?: string })?.content;
          if (content) {
            return { taskId: task.id, name: task.name, status: task.status, brief: content };
          }
        }
      } catch {
        // Skip items we can't read
      }
      return null;
    }),
  );

  // Also fetch briefs for subitems (deliverables/tasks under top-level items)
  // by querying all itemBriefs docs that start with the task ID
  // For now, only fetch top-level item briefs to keep it fast

  const briefs = briefResults.filter(
    (b): b is NonNullable<typeof b> => b !== null,
  );
  return briefs.length > 0 ? briefs : undefined;
}

/**
 * Run the agent loop (non-streaming): send conversation to Claude, execute
 * any tool calls, feed results back, and repeat until we get a text response.
 */
export async function runAgent(
  conversationHistory: ChatMessage[],
  userMessage: string,
  uid: string,
  userEmail: string,
  apiKey: string,
  boardContext?: Record<string, unknown>,
  itemContext?: ItemContextPayload,
): Promise<AgentResult> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content as string,
    })),
    { role: "user", content: userMessage },
  ];

  const projectId = boardContext?.id as string | undefined;
  const workspaceId = boardContext?.workspaceId as string | undefined;
  const briefsContext = await loadBriefsContext(uid, projectId, workspaceId);

  // For board-level chat (no itemContext), load active item briefs
  if (!itemContext) {
    briefsContext.activeItemBriefs = await loadActiveItemBriefs(boardContext, projectId);
  }

  const systemPrompt = buildSystemPrompt(userEmail, boardContext, briefsContext, itemContext);
  const allToolCalls: AgentResult["toolCalls"] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    if (toolUseBlocks.length === 0) {
      const finalText = textBlocks.map((b) => b.text).join("\n");
      return { response: finalText, toolCalls: allToolCalls };
    }

    messages.push({ role: "assistant", content: response.content });

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

    messages.push({ role: "user", content: toolResults });
  }

  return {
    response:
      "I reached the maximum number of tool calls. Please try a simpler request.",
    toolCalls: allToolCalls,
  };
}

/**
 * Streaming agent loop — same tool-call logic but streams the final
 * text response via callbacks.
 *
 * Tool-calling rounds use non-streaming (need full response to execute tools).
 * The final round uses streaming and emits text deltas via onToken.
 */
export async function runAgentStreaming(
  conversationHistory: ChatMessage[],
  userMessage: string,
  uid: string,
  userEmail: string,
  apiKey: string,
  boardContext: Record<string, unknown> | undefined,
  onToken: (text: string) => void,
  onToolCall: (name: string) => void,
  modelOverride?: string,
  itemContext?: ItemContextPayload,
): Promise<AgentResult> {
  const client = new Anthropic({ apiKey });
  const model = modelOverride === "haiku" ? HAIKU_MODEL : SONNET_MODEL;

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content as string,
    })),
    { role: "user", content: userMessage },
  ];

  const projectId = boardContext?.id as string | undefined;
  const workspaceId = boardContext?.workspaceId as string | undefined;
  const briefsContext = await loadBriefsContext(uid, projectId, workspaceId);

  // For board-level chat (no itemContext), load active item briefs
  if (!itemContext) {
    briefsContext.activeItemBriefs = await loadActiveItemBriefs(boardContext, projectId);
  }

  const systemPrompt = buildSystemPrompt(userEmail, boardContext, briefsContext, itemContext);
  const allToolCalls: AgentResult["toolCalls"] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Use streaming on every round. If tool_use blocks appear, we collect
    // them and continue the loop. If only text, we stream to the client.
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: toolDefinitions,
      messages,
    });

    // Collect the full response while also streaming text deltas
    const contentBlocks: Anthropic.ContentBlock[] = [];
    let hasToolUse = false;

    // Listen for streaming events
    stream.on("contentBlock", (block: Anthropic.ContentBlock) => {
      contentBlocks.push(block);
      if (block.type === "tool_use") {
        hasToolUse = true;
      }
    });

    stream.on("text", (text: string) => {
      if (!hasToolUse) {
        // Only stream to client if this round has no tool calls
        onToken(text);
      }
    });

    // Wait for the full message
    const finalMessage = await stream.finalMessage();

    // Reconcile content blocks from the final message
    const toolUseBlocks = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    const textBlocks = finalMessage.content.filter(
      (block): block is Anthropic.TextBlock => block.type === "text"
    );

    if (toolUseBlocks.length === 0) {
      // Final round — text was already streamed via onToken
      const finalText = textBlocks.map((b) => b.text).join("\n");
      return { response: finalText, toolCalls: allToolCalls };
    }

    // Tool-calling round — if we accidentally streamed text, that's fine
    // (it was thinking text before tool calls). Add assistant response to messages.
    messages.push({ role: "assistant", content: finalMessage.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      allToolCalls.push({
        name: toolUse.name,
        input: toolUse.input as Record<string, unknown>,
      });
      onToolCall(toolUse.name);

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

    messages.push({ role: "user", content: toolResults });
  }

  return {
    response:
      "I reached the maximum number of tool calls. Please try a simpler request.",
    toolCalls: allToolCalls,
  };
}
