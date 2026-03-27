/**
 * Agent tool definitions and their Firestore implementations.
 *
 * Each tool has:
 *   - definition: The schema sent to the LLM
 *   - execute: The server-side function that runs when the LLM calls the tool
 */
import * as admin from "firebase-admin";
import Anthropic from "@anthropic-ai/sdk";
import {
  getProjectPermissions,
  type MemberPermissions,
} from "../middleware/permissions";

// Re-export the tool type for convenience
export type ToolDefinition = Anthropic.Tool;

const db = () => admin.firestore();

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * The Firestore doc at projects/{id}/state/main stores board state as:
 * { value: JSON.stringify(board), updatedAt, updatedBy }
 *
 * This matches the frontend's projectSync.ts pattern.
 */
interface BoardStateDoc {
  value: string;
  updatedAt: admin.firestore.Timestamp;
  updatedBy: string;
}

interface BoardState {
  id: string;
  name: string;
  workspaceId: string;
  status: string;
  archivedAt?: string | null;
  groups: Array<{ id: string; name: string; color: string }>;
  tasks: Array<{
    id: string;
    groupId: string;
    name: string;
    status: string;
    jobTypeId: string;
    assignees: string[];
    start: string | null;
    duration: number | null;
    progress: number;
    priority: string;
    subitems: Array<{
      id: string;
      name: string;
      status: string;
      assignees: string[];
      start: string | null;
      duration: number | null;
    }>;
    updates?: Array<{
      id: string;
      text: string;
      author: string;
      createdAt: string;
    }>;
  }>;
}

async function getBoardState(projectId: string): Promise<BoardState | null> {
  const snap = await db()
    .collection("projects")
    .doc(projectId)
    .collection("state")
    .doc("main")
    .get();
  if (!snap.exists) return null;
  const data = snap.data() as BoardStateDoc;
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as BoardState;
  } catch {
    return null;
  }
}

/** Write board state back to Firestore in the same serialized format the frontend uses. */
function serializeStateUpdate(
  state: BoardState,
  uid: string
): Record<string, unknown> {
  return {
    value: JSON.stringify(state),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: uid,
  };
}

async function requireEditPermission(
  projectId: string,
  uid: string
): Promise<MemberPermissions> {
  const perms = await getProjectPermissions(db(), projectId, uid);
  if (!perms) throw new Error(`You are not a member of project ${projectId}.`);
  if (!perms.canEdit)
    throw new Error(`You don't have edit permission on this project.`);
  return perms;
}

/** Get all project IDs the user is a member of. */
async function getUserProjectIds(uid: string): Promise<string[]> {
  // Query across all project member subcollections using collectionGroup
  const snap = await db()
    .collectionGroup("members")
    .where("uid", "==", uid)
    .get();

  const projectIds: string[] = [];
  for (const doc of snap.docs) {
    // Path: projects/{projectId}/members/{uid}
    const projectId = doc.ref.parent.parent?.id;
    if (projectId) projectIds.push(projectId);
  }
  return projectIds;
}

// ─── Tool Definitions ───────────────────────────────────────────────

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "query_projects",
    description:
      "Search for projects the user has access to. Returns project names, IDs, and basic metadata. Use this to find a project by name before performing operations on it.",
    input_schema: {
      type: "object" as const,
      properties: {
        name_contains: {
          type: "string",
          description:
            "Filter projects whose name contains this string (case-insensitive).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_project_summary",
    description:
      "Get a detailed summary of a project including all groups, tasks, statuses, and recent updates.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to summarize.",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task in a project. Requires the project ID and group ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        group_id: {
          type: "string",
          description:
            "The group ID to add the task to. Use get_project_summary to find group IDs.",
        },
        name: { type: "string", description: "The task name." },
        status: {
          type: "string",
          description: "Task status. Default: 'pending'.",
          enum: ["done", "working", "stuck", "pending", "review"],
        },
        job_type: {
          type: "string",
          description: "Job type ID. Optional.",
          enum: ["design", "dev", "marketing", "planning", "research"],
        },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Array of user UIDs to assign.",
        },
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format.",
        },
        duration: {
          type: "number",
          description: "Duration in days.",
        },
        priority: {
          type: "string",
          description: "Priority level.",
          enum: ["low", "medium", "high", "critical"],
        },
      },
      required: ["project_id", "group_id", "name"],
    },
  },
  {
    name: "update_task",
    description:
      "Update fields on an existing task. Only include fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The task ID to update." },
        name: { type: "string", description: "New task name." },
        status: {
          type: "string",
          enum: ["done", "working", "stuck", "pending", "review"],
        },
        job_type: {
          type: "string",
          enum: ["design", "dev", "marketing", "planning", "research"],
        },
        assignees: {
          type: "array",
          items: { type: "string" },
          description: "Replace assignees with this list.",
        },
        start_date: {
          type: "string",
          description: "Start date in YYYY-MM-DD format, or null to clear.",
        },
        duration: {
          type: "number",
          description: "Duration in days, or null to clear.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
      },
      required: ["project_id", "task_id"],
    },
  },
  {
    name: "get_overdue_items",
    description:
      "Find tasks that are past their end date (start + duration) and not marked as done. Can search across all user projects or a specific project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description:
            "Optional. If provided, only search this project. Otherwise searches all user projects.",
        },
      },
      required: [],
    },
  },
  {
    name: "add_update",
    description: "Post a comment/update on a task.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The task ID." },
        text: { type: "string", description: "The comment text." },
      },
      required: ["project_id", "task_id", "text"],
    },
  },
  // ── Memory tools ──────────────────────────────────────────────────
  {
    name: "save_memory",
    description:
      "Save an important fact to persistent memory. Use this proactively when you encounter decisions, deadlines, budgets, client preferences, key contacts, stakeholder info, creative direction, deliverable details, or any information that would be useful to recall in future conversations. Facts persist even when chat history is cleared.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["project", "workspace", "user"],
          description:
            "Where to store the fact. 'project' for project-specific info, 'workspace' for team-wide knowledge, 'user' for personal preferences.",
        },
        project_id: {
          type: "string",
          description: "Required when scope is 'project'. The project ID.",
        },
        workspace_id: {
          type: "string",
          description: "Required when scope is 'workspace'. The workspace ID.",
        },
        content: {
          type: "string",
          description: "The fact to remember.",
        },
        category: {
          type: "string",
          description:
            "Category for the fact. Use the user's custom categories when available, or a reasonable default like 'general'.",
        },
        fact_id: {
          type: "string",
          description:
            "Optional. If provided, updates an existing fact instead of creating a new one.",
        },
      },
      required: ["scope", "content"],
    },
  },
  {
    name: "recall_memory",
    description:
      "Retrieve facts from persistent memory. Searches across project, workspace, and user scopes by default. Use this when you need to recall previously stored information.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Project ID to search project-level memory.",
        },
        workspace_id: {
          type: "string",
          description: "Workspace ID to search workspace-level memory.",
        },
        scope: {
          type: "string",
          enum: ["project", "workspace", "user", "all"],
          description: "Which scope to search. Default: 'all'.",
        },
        category: {
          type: "string",
          description: "Filter by category.",
        },
        search: {
          type: "string",
          description: "Search term to filter facts by content (case-insensitive).",
        },
      },
      required: [],
    },
  },
  {
    name: "update_project_brief",
    description:
      "Update the living project brief — a synthesized summary of everything known about the project. Update this when significant new information changes the project picture.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID.",
        },
        content: {
          type: "string",
          description: "The updated brief content in markdown format.",
        },
      },
      required: ["project_id", "content"],
    },
  },
  {
    name: "delete_memory",
    description:
      "Delete a specific fact from memory. Use when a fact is outdated, incorrect, or the user asks to remove it.",
    input_schema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["project", "workspace", "user"],
          description: "The scope where the fact is stored.",
        },
        project_id: {
          type: "string",
          description: "Required when scope is 'project'.",
        },
        workspace_id: {
          type: "string",
          description: "Required when scope is 'workspace'.",
        },
        fact_id: {
          type: "string",
          description: "The ID of the fact to delete.",
        },
      },
      required: ["scope", "fact_id"],
    },
  },
  {
    name: "update_user_preferences",
    description:
      "Update the user's AI memory preferences, including custom fact categories and working style notes. Use this when setting up a new user or when they want to change their category preferences.",
    input_schema: {
      type: "object" as const,
      properties: {
        fact_categories: {
          type: "array",
          items: { type: "string" },
          description:
            "The user's preferred fact categories (e.g. ['filming-date', 'key-contact', 'budget', 'deadline']).",
        },
        working_style: {
          type: "string",
          description:
            "Notes about how the user prefers to work, for tailoring AI responses.",
        },
      },
      required: [],
    },
  },
];

// ─── Tool Execution ─────────────────────────────────────────────────

interface ToolInput {
  [key: string]: unknown;
}

export async function executeTool(
  toolName: string,
  input: ToolInput,
  uid: string,
  userEmail: string
): Promise<string> {
  switch (toolName) {
    case "query_projects":
      return queryProjects(input, uid);
    case "get_project_summary":
      return getProjectSummary(input, uid);
    case "create_task":
      return createTask(input, uid);
    case "update_task":
      return updateTask(input, uid);
    case "get_overdue_items":
      return getOverdueItems(input, uid);
    case "add_update":
      return addUpdate(input, uid, userEmail);
    case "save_memory":
      return saveMemory(input, uid);
    case "recall_memory":
      return recallMemory(input, uid);
    case "update_project_brief":
      return updateProjectBrief(input, uid);
    case "delete_memory":
      return deleteMemory(input, uid);
    case "update_user_preferences":
      return updateUserPreferences(input, uid);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ─── Tool Implementations ───────────────────────────────────────────

async function queryProjects(input: ToolInput, uid: string): Promise<string> {
  const nameFilter = (input.name_contains as string)?.toLowerCase();
  const projectIds = await getUserProjectIds(uid);

  if (projectIds.length === 0) {
    return JSON.stringify({ projects: [], message: "No projects found." });
  }

  // Fetch project metadata (the board doc itself has name, status, etc.)
  const results: Array<{
    id: string;
    name: string;
    status: string;
    taskCount: number;
    groupCount: number;
  }> = [];

  for (const pid of projectIds) {
    const state = await getBoardState(pid);
    if (!state) continue;

    // Skip archived boards
    if (state.archivedAt) continue;

    // We need the project-level doc for the name
    const projDoc = await db().collection("projects").doc(pid).get();
    const projData = projDoc.data();
    const projectName = (projData?.name as string) || "Untitled";

    if (nameFilter && !projectName.toLowerCase().includes(nameFilter)) continue;

    results.push({
      id: pid,
      name: projectName,
      status: (projData?.status as string) || "",
      taskCount: state.tasks?.length || 0,
      groupCount: state.groups?.length || 0,
    });
  }

  return JSON.stringify({ projects: results });
}

async function getProjectSummary(
  input: ToolInput,
  uid: string
): Promise<string> {
  const projectId = input.project_id as string;
  const perms = await getProjectPermissions(db(), projectId, uid);
  if (!perms || !perms.canView) {
    return JSON.stringify({
      error: "You don't have access to this project.",
    });
  }

  const state = await getBoardState(projectId);
  if (!state) {
    return JSON.stringify({ error: "Project state not found." });
  }

  const projDoc = await db().collection("projects").doc(projectId).get();
  const projectName = (projDoc.data()?.name as string) || "Untitled";

  // Build a summary
  const statusCounts: Record<string, number> = {};
  const overdueTasks: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  for (const task of state.tasks || []) {
    statusCounts[task.status] = (statusCounts[task.status] || 0) + 1;

    if (
      task.start &&
      task.duration &&
      task.status !== "done"
    ) {
      const endDate = new Date(task.start);
      endDate.setDate(endDate.getDate() + task.duration);
      if (endDate.toISOString().split("T")[0] < today) {
        overdueTasks.push(task.name);
      }
    }
  }

  return JSON.stringify({
    project: {
      id: projectId,
      name: projectName,
      groups: state.groups.map((g) => ({
        id: g.id,
        name: g.name,
      })),
      taskCount: state.tasks.length,
      statusBreakdown: statusCounts,
      overdueTasks,
      tasks: state.tasks.map((t) => ({
        id: t.id,
        groupId: t.groupId,
        name: t.name,
        status: t.status,
        jobType: t.jobTypeId,
        assignees: t.assignees,
        start: t.start,
        duration: t.duration,
        progress: t.progress,
        priority: t.priority,
        subitemCount: t.subitems?.length || 0,
        recentUpdates: (t.updates || []).slice(-3).map((u) => ({
          text: u.text,
          author: u.author,
          date: u.createdAt,
        })),
      })),
    },
  });
}

async function createTask(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  await requireEditPermission(projectId, uid);

  const stateRef = db()
    .collection("projects")
    .doc(projectId)
    .collection("state")
    .doc("main");

  const taskId = `t${Date.now()}`;
  const newTask = {
    id: taskId,
    groupId: input.group_id as string,
    name: input.name as string,
    status: (input.status as string) || "pending",
    jobTypeId: (input.job_type as string) || "",
    assignees: (input.assignees as string[]) || [],
    start: (input.start_date as string) || null,
    duration: (input.duration as number) || null,
    progress: 0,
    priority: (input.priority as string) || "",
    subitems: [],
    updates: [],
    files: [],
  };

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(stateRef);
    const data = snap.data() as BoardStateDoc;
    const state = JSON.parse(data.value) as BoardState;
    const tasks = state.tasks || [];
    tasks.push(newTask);
    state.tasks = tasks;
    txn.update(stateRef, serializeStateUpdate(state, uid));
  });

  return JSON.stringify({
    success: true,
    task: { id: taskId, name: newTask.name },
    message: `Created task "${newTask.name}" in the project.`,
  });
}

async function updateTask(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  await requireEditPermission(projectId, uid);

  const stateRef = db()
    .collection("projects")
    .doc(projectId)
    .collection("state")
    .doc("main");

  let updatedName = "";

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(stateRef);
    const data = snap.data() as BoardStateDoc;
    const state = JSON.parse(data.value) as BoardState;
    const tasks = state.tasks || [];
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) throw new Error(`Task ${taskId} not found.`);

    const task = tasks[taskIndex];

    if (input.name !== undefined) task.name = input.name as string;
    if (input.status !== undefined) task.status = input.status as string;
    if (input.job_type !== undefined)
      task.jobTypeId = input.job_type as string;
    if (input.assignees !== undefined)
      task.assignees = input.assignees as string[];
    if (input.start_date !== undefined)
      task.start = input.start_date as string | null;
    if (input.duration !== undefined)
      task.duration = input.duration as number | null;
    if (input.priority !== undefined)
      task.priority = input.priority as string;

    tasks[taskIndex] = task;
    state.tasks = tasks;
    updatedName = task.name;
    txn.update(stateRef, serializeStateUpdate(state, uid));
  });

  return JSON.stringify({
    success: true,
    message: `Updated task "${updatedName}".`,
  });
}

async function getOverdueItems(
  input: ToolInput,
  uid: string
): Promise<string> {
  const specificProject = input.project_id as string | undefined;
  const projectIds = specificProject
    ? [specificProject]
    : await getUserProjectIds(uid);

  const today = new Date().toISOString().split("T")[0];
  const overdue: Array<{
    projectId: string;
    projectName: string;
    taskId: string;
    taskName: string;
    status: string;
    endDate: string;
  }> = [];

  for (const pid of projectIds) {
    const perms = await getProjectPermissions(db(), pid, uid);
    if (!perms?.canView) continue;

    const state = await getBoardState(pid);
    if (!state) continue;

    // Skip archived boards
    if (state.archivedAt) continue;

    const projDoc = await db().collection("projects").doc(pid).get();
    const projectName = (projDoc.data()?.name as string) || "Untitled";

    for (const task of state.tasks || []) {
      if (task.status === "done") continue;
      if (!task.start || !task.duration) continue;

      const endDate = new Date(task.start);
      endDate.setDate(endDate.getDate() + task.duration);
      const endStr = endDate.toISOString().split("T")[0];

      if (endStr < today) {
        overdue.push({
          projectId: pid,
          projectName,
          taskId: task.id,
          taskName: task.name,
          status: task.status,
          endDate: endStr,
        });
      }
    }
  }

  return JSON.stringify({
    overdue,
    count: overdue.length,
    message:
      overdue.length === 0
        ? "No overdue tasks found."
        : `Found ${overdue.length} overdue task(s).`,
  });
}

async function addUpdate(
  input: ToolInput,
  uid: string,
  userEmail: string
): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const text = input.text as string;
  await requireEditPermission(projectId, uid);

  const stateRef = db()
    .collection("projects")
    .doc(projectId)
    .collection("state")
    .doc("main");

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(stateRef);
    const data = snap.data() as BoardStateDoc;
    const state = JSON.parse(data.value) as BoardState;
    const tasks = state.tasks || [];
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) throw new Error(`Task ${taskId} not found.`);

    const task = tasks[taskIndex];
    const updates = task.updates || [];
    updates.push({
      id: `u${Date.now()}`,
      text,
      author: userEmail,
      createdAt: new Date().toISOString(),
    });
    task.updates = updates;
    tasks[taskIndex] = task;
    state.tasks = tasks;
    txn.update(stateRef, serializeStateUpdate(state, uid));
  });

  return JSON.stringify({
    success: true,
    message: `Added update to task.`,
  });
}

// ─── Memory Tool Implementations ─────────────────────────────────

interface MemoryFact {
  id: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryFactsDoc {
  facts: MemoryFact[];
  updatedAt: string;
  archivedAt?: string;
}

/** Resolve the Firestore document reference for a memory facts doc based on scope. */
function getMemoryFactsRef(
  scope: string,
  uid: string,
  projectId?: string,
  workspaceId?: string
): admin.firestore.DocumentReference {
  switch (scope) {
    case "project":
      if (!projectId) throw new Error("project_id is required for project scope.");
      return db().collection("projects").doc(projectId).collection("aiMemory").doc("facts");
    case "workspace":
      if (!workspaceId) throw new Error("workspace_id is required for workspace scope.");
      // Workspace memory is stored under the org's workspace subcollection
      // We store it at a top-level path for simplicity since Cloud Functions bypass rules
      return db().collection("workspaceMemory").doc(workspaceId);
    case "user":
      return db().collection("users").doc(uid).collection("aiMemory").doc("facts");
    default:
      throw new Error(`Invalid scope: ${scope}`);
  }
}

async function saveMemory(input: ToolInput, uid: string): Promise<string> {
  const scope = input.scope as string;
  const content = input.content as string;
  const category = (input.category as string) || "general";
  const factId = (input.fact_id as string) || `mf_${Date.now()}`;
  const projectId = input.project_id as string | undefined;
  const workspaceId = input.workspace_id as string | undefined;

  // Permission check for project scope
  if (scope === "project" && projectId) {
    await requireEditPermission(projectId, uid);
  }

  const ref = getMemoryFactsRef(scope, uid, projectId, workspaceId);
  const now = new Date().toISOString();

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const data = snap.exists ? (snap.data() as MemoryFactsDoc) : { facts: [], updatedAt: now };
    const facts = data.facts || [];

    const existingIndex = facts.findIndex((f) => f.id === factId);
    if (existingIndex >= 0) {
      // Update existing fact
      facts[existingIndex] = { ...facts[existingIndex], content, category, updatedAt: now };
    } else {
      // Add new fact
      facts.push({ id: factId, content, category, createdAt: now, updatedAt: now });
    }

    txn.set(ref, { facts, updatedAt: now }, { merge: true });
  });

  return JSON.stringify({
    success: true,
    fact_id: factId,
    message: `Saved memory fact to ${scope} scope.`,
  });
}

async function recallMemory(input: ToolInput, uid: string): Promise<string> {
  const scope = (input.scope as string) || "all";
  const category = input.category as string | undefined;
  const search = (input.search as string)?.toLowerCase();
  const projectId = input.project_id as string | undefined;
  const workspaceId = input.workspace_id as string | undefined;

  const results: Record<string, MemoryFact[]> = {};

  const loadFacts = async (
    scopeName: string,
    ref: admin.firestore.DocumentReference
  ) => {
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data() as MemoryFactsDoc;
    // Skip archived memory
    if (data.archivedAt) return;
    let facts = data.facts || [];

    if (category) {
      facts = facts.filter((f) => f.category === category);
    }
    if (search) {
      facts = facts.filter((f) => f.content.toLowerCase().includes(search));
    }
    if (facts.length > 0) {
      results[scopeName] = facts;
    }
  };

  if (scope === "all" || scope === "user") {
    await loadFacts(
      "user",
      db().collection("users").doc(uid).collection("aiMemory").doc("facts")
    );
  }

  if ((scope === "all" || scope === "workspace") && workspaceId) {
    await loadFacts(
      "workspace",
      db().collection("workspaceMemory").doc(workspaceId)
    );
  }

  if ((scope === "all" || scope === "project") && projectId) {
    const perms = await getProjectPermissions(db(), projectId, uid);
    if (perms?.canView) {
      await loadFacts(
        "project",
        db().collection("projects").doc(projectId).collection("aiMemory").doc("facts")
      );
    }
  }

  const totalFacts = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  return JSON.stringify({
    memory: results,
    totalFacts,
    message: totalFacts === 0 ? "No matching facts found." : `Found ${totalFacts} fact(s).`,
  });
}

async function updateProjectBrief(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const content = input.content as string;
  await requireEditPermission(projectId, uid);

  const ref = db()
    .collection("projects")
    .doc(projectId)
    .collection("aiMemory")
    .doc("brief");

  await ref.set({
    content,
    updatedAt: new Date().toISOString(),
    updatedBy: "ai",
  });

  return JSON.stringify({
    success: true,
    message: "Project brief updated.",
  });
}

async function deleteMemory(input: ToolInput, uid: string): Promise<string> {
  const scope = input.scope as string;
  const factId = input.fact_id as string;
  const projectId = input.project_id as string | undefined;
  const workspaceId = input.workspace_id as string | undefined;

  if (scope === "project" && projectId) {
    await requireEditPermission(projectId, uid);
  }

  const ref = getMemoryFactsRef(scope, uid, projectId, workspaceId);

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (!snap.exists) throw new Error("No memory facts found.");
    const data = snap.data() as MemoryFactsDoc;
    const facts = (data.facts || []).filter((f) => f.id !== factId);
    txn.update(ref, { facts, updatedAt: new Date().toISOString() });
  });

  return JSON.stringify({
    success: true,
    message: `Deleted memory fact ${factId}.`,
  });
}

async function updateUserPreferences(input: ToolInput, uid: string): Promise<string> {
  const ref = db().collection("users").doc(uid).collection("aiMemory").doc("preferences");

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.fact_categories !== undefined) {
    update.factCategories = input.fact_categories as string[];
  }
  if (input.working_style !== undefined) {
    update.workingStyle = input.working_style as string;
  }

  await ref.set(update, { merge: true });

  return JSON.stringify({
    success: true,
    message: "User preferences updated.",
  });
}
