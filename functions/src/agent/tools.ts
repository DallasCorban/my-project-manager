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
