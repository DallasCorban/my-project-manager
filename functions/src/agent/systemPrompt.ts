/**
 * Build the system prompt for the AI agent, injecting project-aware context
 * and persistent briefs from all scopes.
 *
 * Returns an array of content blocks so the static portion can be cached
 * via Anthropic's prompt caching (cache_control: { type: "ephemeral" }).
 */

import type Anthropic from "@anthropic-ai/sdk";

const STATUSES = [
  { id: "done", label: "Done" },
  { id: "working", label: "Working on it" },
  { id: "stuck", label: "Stuck" },
  { id: "pending", label: "Pending" },
  { id: "review", label: "In Review" },
];

const JOB_TYPES = [
  { id: "design", label: "Design" },
  { id: "dev", label: "Development" },
  { id: "marketing", label: "Marketing" },
  { id: "planning", label: "Planning" },
  { id: "research", label: "Research" },
];

// ── Legacy types (kept for backward compatibility during migration) ──

export interface MemoryFact {
  id: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryContext {
  projectFacts: MemoryFact[];
  workspaceFacts: MemoryFact[];
  userFacts: MemoryFact[];
  projectBrief: string | null;
  userPreferences: {
    factCategories: string[];
    workingStyle: string | null;
  } | null;
}

// ── New briefs-based context ──

export interface BriefsContext {
  projectBrief: string | null;
  teamBrief: string | null;
  userBrief: string | null;
  /** Item-level brief (only present in item-scoped conversations). */
  itemBrief: string | null;
  /** Briefs for all active (non-done) items — used in board-level AI. */
  activeItemBriefs?: Array<{ taskId: string; name: string; status: string; brief: string }>;
}

export interface ItemContextPayload {
  projectId: string;
  projectName: string;
  taskId: string;
  subitemId: string | null;
  subSubitemId: string | null;
  itemName: string;
  itemType: string;
  parentName?: string;
  status: string;
  assignees: string[];
  priority?: string;
  start: string | null;
  duration: number | null;
  updates: Array<{
    id: string;
    text: string;
    checklist?: Array<{ text: string; done: boolean }>;
    replies: Array<{ text: string; author: string; createdAt: string }>;
    author: string;
    createdAt: string;
  }>;
  digestedFiles: Array<{
    fileId: string;
    fileName: string;
    fileType: string;
    extractedText: string;
    speakerLabels?: Record<string, string>;
  }>;
  subitems: Array<{
    id: string;
    name: string;
    status: string;
    assignees: string[];
    start: string | null;
    duration: number | null;
  }>;
  parentBriefs: Array<{ name: string; type: string; brief: string }>;
  childrenContext: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    brief?: string;
    updates?: Array<{
      id: string;
      text: string;
      author: string;
      createdAt: string;
    }>;
  }>;
  currentItemBrief: string | null;
}

// ── Legacy helper (still used during migration) ──

function formatFactsByCategory(facts: MemoryFact[]): string {
  if (facts.length === 0) return "  (none)\n";
  const grouped: Record<string, MemoryFact[]> = {};
  for (const fact of facts) {
    const cat = fact.category || "general";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(fact);
  }
  let out = "";
  for (const [category, catFacts] of Object.entries(grouped)) {
    out += `  **${category}**:\n`;
    for (const f of catFacts) {
      out += `  - [${f.id}] ${f.content}\n`;
    }
  }
  return out;
}

/** Static instructions that rarely change — cached via Anthropic prompt caching. */
const STATIC_INSTRUCTIONS = `You are an AI project management assistant for Flow, a project management application.

## Your Capabilities
You help users manage their projects by querying project data, creating and updating tasks, and providing project insights. You have access to tools that let you read and write project data directly. You maintain auto-generated briefs at every level of the project hierarchy that serve as persistent memory across conversations.

## Brief System
You maintain running briefs (summaries) at multiple levels. Briefs are the primary way you persist knowledge across conversations. They are also shown to users in the app's Brief tab, so write them for human readability.

**Brief levels:**
- **Project brief**: Overview of the entire project (goals, budget, timeline, key stakeholders, creative direction)
- **Item brief**: Summary of a specific task, deliverable, or sub-task (specs, decisions, status, blockers)
- **Team brief**: Workspace-wide knowledge (processes, standards, team roles, tools)
- **User brief**: Personal preferences and working style for this specific user

**When to update briefs (use update_item_brief, update_project_brief, update_team_brief, update_user_brief):**
- After learning significant new information from conversation
- When project scope, status, or direction changes
- When decisions are made or deadlines shift
- When you learn about team processes or user preferences
- After processing uploaded content (transcripts, documents)

**Brief writing guidelines:**
- Keep briefs concise but comprehensive — aim for a clear snapshot
- Lead with the most important information
- Include specific details: dates, names, numbers, specs
- Update incrementally — don't rewrite from scratch unless the brief is outdated
- When learning something at a child level (task), propagate significant updates to parent briefs (deliverable, project)

**Proactive brief updates:**
After EVERY response, silently ask yourself: "Did the user share anything that should update a brief?"
If yes, update the relevant brief(s). Propagate important changes upward to parent briefs.

## Data Model
Projects contain groups (like categories or phases). Each group contains tasks. Items can be typed as:
- **Project**: top-level project item
- **Deliverable**: a major deliverable within the project
- **Task**: a specific piece of work within a deliverable

Tasks can have:
- Status: ${STATUSES.map((s) => `"${s.id}" (${s.label})`).join(", ")}
- Job type: ${JOB_TYPES.map((j) => `"${j.id}" (${j.label})`).join(", ")}
- Assignees (user UIDs)
- Start date (YYYY-MM-DD) and duration (in days)
- Progress (0-100)
- Priority ("low", "medium", "high", "critical", or empty)
- Subitems (subtasks with similar fields, can nest 3 levels deep)
- Updates (comments with optional checklists and reply threads)
- Files (uploaded documents, media, etc.)

## Guidelines
- Be conversational, brief, and natural. Talk like a helpful colleague, not a corporate assistant.
- Do NOT introduce yourself, list your capabilities, or give a board overview when the user says hello. Just say hi and ask how you can help — keep it short and warm.
- Do NOT recite board content back to the user unprompted — they can already see it. Only mention specific tasks when directly asked or when it's relevant to their question.
- Be concise and actionable. Lead with the answer, not preamble.
- When the user asks about "this board" or "this project", use the Current Board context.
- When creating tasks, use reasonable defaults: status "pending", no assignees unless specified, no dates unless specified.
- When the user refers to a different project by name, use query_projects to find it first.
- For ambiguous requests, ask for clarification rather than guessing.
- When listing tasks, format them clearly with status and key details.
- Use task IDs internally but show task names to the user.
- If a tool call fails due to permissions, explain what happened clearly.
- Proactively update briefs with important information from conversations.
- Keep responses short for simple interactions. Save detail for when the user asks for it.`;

export type SystemPromptBlock = Anthropic.TextBlockParam & {
  cache_control?: { type: "ephemeral" };
};

/**
 * Build the system prompt as an array of content blocks.
 * Block 0: static instructions (cacheable).
 * Block 1: dynamic context — board state, briefs, user info (not cached).
 * Block 2 (optional): item context — detailed item data for item-level AI.
 */
export function buildSystemPrompt(
  userEmail: string,
  boardContext?: Record<string, unknown>,
  memoryContext?: MemoryContext,
  briefsContext?: BriefsContext,
  itemContext?: ItemContextPayload,
): SystemPromptBlock[] {
  // --- Block 0: static, cacheable ---
  const staticBlock: SystemPromptBlock = {
    type: "text",
    text: STATIC_INSTRUCTIONS,
    cache_control: { type: "ephemeral" },
  };

  // --- Block 1: dynamic context ---
  let dynamicText = `## Current User\n- Email: ${userEmail}\n`;

  if (boardContext) {
    dynamicText += `
## Current Board
You are viewing the board "${boardContext.name}" (ID: ${boardContext.id}).
Use this context to answer questions directly — do NOT call get_project_summary or query_projects unless the user explicitly asks about a different board.

${JSON.stringify(boardContext, null, 2)}

When the user asks to create or update tasks on this board, use the project ID "${boardContext.id}" directly.
`;
  }

  // New briefs-based context (preferred)
  if (briefsContext) {
    dynamicText += `
## Briefs (Persistent Memory)
Briefs are living summaries you maintain. Update them when you learn new information.

### Project Brief
${briefsContext.projectBrief || "(No project brief yet — create one as you learn about this project.)"}

### Team Knowledge
${briefsContext.teamBrief || "(No team brief yet — save team processes, standards, and roles here.)"}

### How to Work With This User
${briefsContext.userBrief || "(No user brief yet — save communication preferences and working style here.)"}`;

    // Active item briefs (board-level AI only — gives visibility into non-done items)
    if (briefsContext.activeItemBriefs && briefsContext.activeItemBriefs.length > 0) {
      dynamicText += `

### Item Briefs (Active Items)
These are summaries of active items in this project. Use them to answer questions about specific tasks or deliverables without needing to drill into item details.

`;
      for (const ib of briefsContext.activeItemBriefs) {
        dynamicText += `**${ib.name}** (${ib.status}):\n${ib.brief}\n\n`;
      }
    }
  }

  // Legacy facts-based context (backward compat — will be removed after migration)
  if (memoryContext && !briefsContext) {
    dynamicText += `
## Project Memory
Persistent memory that survives chat clears. Use fact IDs (e.g. mf_...) when updating or deleting facts.

### Project Brief
${memoryContext.projectBrief || "(No project brief yet — create one when you have enough context about this project.)"}

### Project Facts
${formatFactsByCategory(memoryContext.projectFacts)}
### Team Knowledge (Workspace)
${formatFactsByCategory(memoryContext.workspaceFacts)}
### Personal Facts
${formatFactsByCategory(memoryContext.userFacts)}`;

    if (memoryContext.userPreferences) {
      const prefs = memoryContext.userPreferences;
      dynamicText += `
### User Preferences
- Custom categories: ${prefs.factCategories.length > 0 ? prefs.factCategories.join(", ") : "(not set)"}
${prefs.workingStyle ? `- Working style: ${prefs.workingStyle}` : ""}`;
    }
  }

  const dynamicBlock: SystemPromptBlock = {
    type: "text",
    text: dynamicText,
  };

  const blocks: SystemPromptBlock[] = [staticBlock, dynamicBlock];

  // --- Block 2 (optional): item context ---
  if (itemContext) {
    let itemText = `
## Current Item Context
You are chatting about a specific item. Focus your responses on this item while using the broader project context for background.

**Item:** ${itemContext.itemName} (${itemContext.itemType})
**Status:** ${itemContext.status}
**Assignees:** ${itemContext.assignees.length > 0 ? itemContext.assignees.join(", ") : "(none)"}
${itemContext.priority ? `**Priority:** ${itemContext.priority}` : ""}
${itemContext.start ? `**Start:** ${itemContext.start}` : ""}
${itemContext.duration ? `**Duration:** ${itemContext.duration} days` : ""}
${itemContext.parentName ? `**Parent:** ${itemContext.parentName}` : ""}

### Item Brief
${itemContext.currentItemBrief || "(No brief yet — create one as you learn about this item.)"}
`;

    // Parent hierarchy briefs
    if (itemContext.parentBriefs.length > 0) {
      itemText += "\n### Parent Context\n";
      for (const parent of itemContext.parentBriefs) {
        itemText += `**${parent.name}** (${parent.type}): ${parent.brief}\n\n`;
      }
    }

    // Subitems summary
    if (itemContext.subitems.length > 0) {
      itemText += "\n### Subitems\n";
      for (const sub of itemContext.subitems) {
        itemText += `- **${sub.name}** — ${sub.status}`;
        if (sub.assignees.length > 0) itemText += ` (${sub.assignees.join(", ")})`;
        itemText += "\n";
      }
    }

    // Children context (may include raw updates or briefs depending on budget)
    if (itemContext.childrenContext.length > 0) {
      itemText += "\n### Children Details\n";
      for (const child of itemContext.childrenContext) {
        itemText += `\n#### ${child.name} (${child.type}) — ${child.status}\n`;
        if (child.brief) {
          itemText += `Brief: ${child.brief}\n`;
        }
        if (child.updates && child.updates.length > 0) {
          itemText += "Updates:\n";
          for (const u of child.updates) {
            itemText += `- [${u.author}, ${u.createdAt}]: ${u.text}\n`;
          }
        }
      }
    }

    // Current item's updates
    if (itemContext.updates.length > 0) {
      itemText += "\n### Item Updates (most recent)\n";
      for (const u of itemContext.updates) {
        itemText += `\n**${u.author}** (${u.createdAt}):\n${u.text}\n`;
        if (u.checklist && u.checklist.length > 0) {
          for (const c of u.checklist) {
            itemText += `  ${c.done ? "☑" : "☐"} ${c.text}\n`;
          }
        }
        if (u.replies.length > 0) {
          for (const r of u.replies) {
            itemText += `  ↳ ${r.author} (${r.createdAt}): ${r.text}\n`;
          }
        }
      }
    }

    // Digested files
    if (itemContext.digestedFiles.length > 0) {
      itemText += "\n### Digested Files\n";
      for (const f of itemContext.digestedFiles) {
        itemText += `\n**${f.fileName}** (${f.fileType}):\n`;
        // Apply speaker labels if present
        let text = f.extractedText;
        if (f.speakerLabels) {
          for (const [key, name] of Object.entries(f.speakerLabels)) {
            text = text.replace(new RegExp(`\\[${key}\\]`, "g"), `[${name}]`);
          }
        }
        itemText += text + "\n";
      }
    }

    blocks.push({
      type: "text",
      text: itemText,
    });
  }

  return blocks;
}
