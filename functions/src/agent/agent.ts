/**
 * Agent orchestration loop — sends messages to Claude with tool definitions,
 * executes tool calls, and loops until the model produces a final text response.
 */
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type MemoryContext, type MemoryFact } from "./systemPrompt";
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

interface MemoryFactsDoc {
  facts: MemoryFact[];
  updatedAt: string;
  archivedAt?: string;
}

interface ProjectBriefDoc {
  content: string;
  updatedAt: string;
  updatedBy: string;
}

interface UserPreferencesDoc {
  factCategories?: string[];
  workingStyle?: string;
  updatedAt: string;
}

const db = () => admin.firestore();

/**
 * Load persistent memory from all three scopes (user, workspace, project).
 */
async function loadMemoryContext(
  uid: string,
  projectId?: string,
  workspaceId?: string
): Promise<MemoryContext> {
  const context: MemoryContext = {
    projectFacts: [],
    workspaceFacts: [],
    userFacts: [],
    projectBrief: null,
    userPreferences: null,
  };

  // Load all memory in parallel
  const promises: Promise<void>[] = [];

  // User preferences
  promises.push(
    db()
      .collection("users")
      .doc(uid)
      .collection("aiMemory")
      .doc("preferences")
      .get()
      .then((snap) => {
        if (snap.exists) {
          const data = snap.data() as UserPreferencesDoc;
          context.userPreferences = {
            factCategories: data.factCategories || [],
            workingStyle: data.workingStyle || null,
          };
        }
      })
      .catch(() => {})
  );

  // User facts
  promises.push(
    db()
      .collection("users")
      .doc(uid)
      .collection("aiMemory")
      .doc("facts")
      .get()
      .then((snap) => {
        if (snap.exists) {
          const data = snap.data() as MemoryFactsDoc;
          context.userFacts = data.facts || [];
        }
      })
      .catch(() => {})
  );

  // Workspace facts
  if (workspaceId) {
    promises.push(
      db()
        .collection("workspaceMemory")
        .doc(workspaceId)
        .get()
        .then((snap) => {
          if (snap.exists) {
            const data = snap.data() as MemoryFactsDoc;
            context.workspaceFacts = data.facts || [];
          }
        })
        .catch(() => {})
    );
  }

  // Project facts + brief
  if (projectId) {
    const memoryCol = db()
      .collection("projects")
      .doc(projectId)
      .collection("aiMemory");

    promises.push(
      memoryCol
        .doc("facts")
        .get()
        .then((snap) => {
          if (snap.exists) {
            const data = snap.data() as MemoryFactsDoc;
            // Skip archived project memory
            if (!data.archivedAt) {
              context.projectFacts = data.facts || [];
            }
          }
        })
        .catch(() => {})
    );

    promises.push(
      memoryCol
        .doc("brief")
        .get()
        .then((snap) => {
          if (snap.exists) {
            const data = snap.data() as ProjectBriefDoc;
            context.projectBrief = data.content || null;
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(promises);
  return context;
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

  // Extract IDs from board context to load memory
  const projectId = boardContext?.id as string | undefined;
  const workspaceId = boardContext?.workspaceId as string | undefined;

  // Load persistent memory from all scopes
  const memoryContext = await loadMemoryContext(uid, projectId, workspaceId);

  const systemPrompt = buildSystemPrompt(userEmail, boardContext, memoryContext);
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
