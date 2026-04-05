/**
 * Agent tool definitions and their Firestore implementations.
 *
 * Each tool has:
 *   - definition: The schema sent to the LLM
 *   - execute: The server-side function that runs when the LLM calls the tool
 */
import * as admin from "firebase-admin";
import { logger } from "firebase-functions";
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
      jobTypeId?: string;
      itemTypeId?: string;
      assignees: string[];
      start: string | null;
      duration: number | null;
      subitems?: Array<{
        id: string;
        name: string;
        status: string;
        jobTypeId?: string;
        itemTypeId?: string;
        assignees: string[];
        start: string | null;
        duration: number | null;
      }>;
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

// ─── Shared Schema Fragments ────────────────────────────────────────

const STATUS_ENUM = {
  type: "string" as const,
  enum: ["done", "working", "stuck", "pending", "review"],
};

const JOB_TYPE_ENUM = {
  type: "string" as const,
  enum: ["design", "dev", "marketing", "planning", "research"],
};

const ITEM_TYPE_ENUM = {
  type: "string" as const,
  enum: ["project", "deliverable", "task"],
};

const PRIORITY_ENUM = {
  type: "string" as const,
  enum: ["low", "medium", "high", "critical"],
};

const ASSIGNEES_SCHEMA = {
  type: "array" as const,
  items: { type: "string" as const },
  description: "Array of user UIDs to assign.",
};

const DATE_SCHEMA = {
  type: "string" as const,
  description: "Start date in YYYY-MM-DD format.",
};

const DURATION_SCHEMA = {
  type: "number" as const,
  description: "Duration in days.",
};

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
      "Get a detailed summary of a project including all groups, tasks, statuses, and recent updates. Use depth to control how much nested structure is returned.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID to summarize.",
        },
        depth: {
          type: "number",
          description: "How deep to show nested items. 0 (default): subitem counts only. 1: include subitems. 2: include sub-subitems too.",
          enum: [0, 1, 2],
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a new task in a project. Requires the project ID and group ID. Returns the created task's ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        group_id: { type: "string", description: "The group ID to add the task to." },
        name: { type: "string", description: "The task name." },
        status: { ...STATUS_ENUM, description: "Task status. Default: 'pending'." },
        job_type: { ...JOB_TYPE_ENUM, description: "Job type ID. Optional." },
        assignees: ASSIGNEES_SCHEMA,
        start_date: DATE_SCHEMA,
        duration: DURATION_SCHEMA,
        priority: { ...PRIORITY_ENUM, description: "Priority level." },
      },
      required: ["project_id", "group_id", "name"],
    },
  },
  {
    name: "create_subitem",
    description:
      "Create a subitem (deliverable or task) under an existing top-level task. Returns the created subitem's ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The parent task ID." },
        name: { type: "string", description: "The subitem name." },
        status: { ...STATUS_ENUM, description: "Status. Default: 'pending'." },
        job_type: { ...JOB_TYPE_ENUM, description: "Job type ID. Optional." },
        item_type: { ...ITEM_TYPE_ENUM, description: "Item type. Optional." },
        assignees: ASSIGNEES_SCHEMA,
        start_date: DATE_SCHEMA,
        duration: DURATION_SCHEMA,
      },
      required: ["project_id", "task_id", "name"],
    },
  },
  {
    name: "create_sub_subitem",
    description:
      "Create a sub-subitem (task) under an existing subitem. Deepest nesting level. Returns the created sub-subitem's ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The top-level task ID." },
        subitem_id: { type: "string", description: "The parent subitem ID." },
        name: { type: "string", description: "The sub-subitem name." },
        status: { ...STATUS_ENUM, description: "Status. Default: 'pending'." },
        job_type: { ...JOB_TYPE_ENUM, description: "Job type ID. Optional." },
        item_type: { ...ITEM_TYPE_ENUM, description: "Item type. Optional." },
        assignees: ASSIGNEES_SCHEMA,
        start_date: DATE_SCHEMA,
        duration: DURATION_SCHEMA,
      },
      required: ["project_id", "task_id", "subitem_id", "name"],
    },
  },
  {
    name: "update_item",
    description:
      "Update fields on any item at any nesting level. Provide task_id alone to update a top-level task. Add subitem_id to target a subitem. Add sub_subitem_id to target a sub-subitem. Only include fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The top-level task ID." },
        subitem_id: { type: "string", description: "Optional. The subitem ID to target." },
        sub_subitem_id: { type: "string", description: "Optional. The sub-subitem ID to target (requires subitem_id)." },
        name: { type: "string", description: "New name." },
        status: STATUS_ENUM,
        job_type: JOB_TYPE_ENUM,
        item_type: ITEM_TYPE_ENUM,
        assignees: { ...ASSIGNEES_SCHEMA, description: "Replace assignees with this list." },
        start_date: { type: "string", description: "Start date in YYYY-MM-DD format, or null to clear." },
        duration: { type: "number", description: "Duration in days, or null to clear." },
        priority: PRIORITY_ENUM,
      },
      required: ["project_id", "task_id"],
    },
  },
  {
    name: "delete_item",
    description:
      "Delete an item and all its children. Provide task_id alone to delete a top-level task. Add subitem_id to delete a subitem. Add sub_subitem_id to delete a sub-subitem.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The top-level task ID." },
        subitem_id: { type: "string", description: "Optional. The subitem ID to delete." },
        sub_subitem_id: { type: "string", description: "Optional. The sub-subitem ID to delete (requires subitem_id)." },
      },
      required: ["project_id", "task_id"],
    },
  },
  {
    name: "move_task",
    description:
      "Move a top-level task to a different group.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The task ID to move." },
        target_group_id: { type: "string", description: "The group ID to move the task to." },
      },
      required: ["project_id", "task_id", "target_group_id"],
    },
  },
  {
    name: "search_items",
    description:
      "Search for items across all nesting levels in a project. Returns matching items with their hierarchy path and parent IDs for use in follow-up tool calls.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID to search." },
        query: { type: "string", description: "Search by name (case-insensitive substring match)." },
        status: { ...STATUS_ENUM, description: "Filter by status." },
        date_from: { type: "string", description: "Filter items starting on or after this date (YYYY-MM-DD)." },
        date_to: { type: "string", description: "Filter items starting on or before this date (YYYY-MM-DD)." },
        item_type: { ...ITEM_TYPE_ENUM, description: "Filter by item type." },
        level: { type: "string", enum: ["task", "subitem", "sub_subitem"], description: "Filter by nesting level." },
        parent_task_id: { type: "string", description: "Only return items under this top-level task." },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_item_details",
    description:
      "Get full details for a specific item including all nested children, brief, and updates. Use this to drill into an item after finding it via search or project summary.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The top-level task ID." },
        subitem_id: { type: "string", description: "Optional. Get details for this subitem instead of the task." },
        sub_subitem_id: { type: "string", description: "Optional. Get details for this sub-subitem (requires subitem_id)." },
      },
      required: ["project_id", "task_id"],
    },
  },
  {
    name: "bulk_create_items",
    description:
      "Create multiple items in a single operation. Items can reference each other via temp_id for parent-child relationships. Process in array order — parents must appear before their children. Max 50 items per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        items: {
          type: "array",
          description: "Array of items to create, processed in order.",
          items: {
            type: "object",
            properties: {
              temp_id: { type: "string", description: "Temporary ID for referencing this item as a parent in later items." },
              type: { type: "string", enum: ["task", "subitem", "sub_subitem"], description: "Item nesting level." },
              group_id: { type: "string", description: "Required for tasks. The group to add the task to." },
              parent_task_id: { type: "string", description: "Required for subitems/sub_subitems. Can be a real ID or a temp_id." },
              parent_subitem_id: { type: "string", description: "Required for sub_subitems. Can be a real ID or a temp_id." },
              name: { type: "string", description: "Item name." },
              status: STATUS_ENUM,
              job_type: JOB_TYPE_ENUM,
              item_type: ITEM_TYPE_ENUM,
              assignees: ASSIGNEES_SCHEMA,
              start_date: DATE_SCHEMA,
              duration: DURATION_SCHEMA,
              priority: PRIORITY_ENUM,
            },
            required: ["type", "name"],
          },
        },
      },
      required: ["project_id", "items"],
    },
  },
  {
    name: "bulk_update_items",
    description:
      "Update multiple items in a single operation. Each entry targets an item by its IDs and applies field changes. Max 50 items per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        updates: {
          type: "array",
          description: "Array of updates to apply.",
          items: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "The top-level task ID." },
              subitem_id: { type: "string", description: "Optional. Target a subitem." },
              sub_subitem_id: { type: "string", description: "Optional. Target a sub-subitem." },
              name: { type: "string", description: "New name." },
              status: STATUS_ENUM,
              job_type: JOB_TYPE_ENUM,
              item_type: ITEM_TYPE_ENUM,
              assignees: { ...ASSIGNEES_SCHEMA, description: "Replace assignees." },
              start_date: { type: "string", description: "Start date YYYY-MM-DD, or null to clear." },
              duration: { type: "number", description: "Duration in days, or null to clear." },
              priority: PRIORITY_ENUM,
            },
            required: ["task_id"],
          },
        },
      },
      required: ["project_id", "updates"],
    },
  },
  {
    name: "get_overdue_items",
    description:
      "Find items (tasks, subitems, sub-subitems) that are past their end date and not marked as done. Checks all nesting levels.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Optional. If provided, only search this project. Otherwise searches all user projects.",
        },
      },
      required: [],
    },
  },
  {
    name: "add_update",
    description: "Post a comment/update on any item. Provide task_id alone for top-level tasks. Add subitem_id/sub_subitem_id to target nested items.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID." },
        task_id: { type: "string", description: "The top-level task ID." },
        subitem_id: { type: "string", description: "Optional. Target a subitem." },
        sub_subitem_id: { type: "string", description: "Optional. Target a sub-subitem (requires subitem_id)." },
        text: { type: "string", description: "The comment text." },
      },
      required: ["project_id", "task_id", "text"],
    },
  },
  // ── Brief tools ──────────────────────────────────────────────────
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
  // ── Drill-down tools ───────────────────────────────────────────────
  {
    name: "get_digested_file",
    description:
      "Retrieve the full extracted text content of a digested file (transcript, PDF text, etc.). Use this when you need to access detailed content from an uploaded file — for example, to answer questions about what was discussed in a meeting recording or find specific information in a document. The item context shows available digested files with their names and sizes.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID.",
        },
        file_id: {
          type: "string",
          description: "The file ID to retrieve content for.",
        },
      },
      required: ["project_id", "file_id"],
    },
  },
  // ── Brief tools (new system) ──────────────────────────────────────
  {
    name: "update_item_brief",
    description:
      "Update the brief for a specific item (task, deliverable, or project item). Briefs are living summaries shown to users and used as AI context. Write for human readability. When updating a child item, also propagate significant changes to parent briefs.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "The project ID.",
        },
        task_id: {
          type: "string",
          description: "The top-level task ID.",
        },
        subitem_id: {
          type: "string",
          description: "Optional subitem ID (for deliverable-level items).",
        },
        sub_subitem_id: {
          type: "string",
          description: "Optional sub-subitem ID (for task-level items).",
        },
        content: {
          type: "string",
          description:
            "The brief content in markdown. Should be a concise, human-readable summary of the item.",
        },
      },
      required: ["project_id", "task_id", "content"],
    },
  },
  {
    name: "update_team_brief",
    description:
      "Update the team/workspace brief. This captures team-wide knowledge: processes, standards, roles, tools, fiscal year, delivery formats, etc. Shared across all projects in the workspace.",
    input_schema: {
      type: "object" as const,
      properties: {
        workspace_id: {
          type: "string",
          description: "The workspace ID.",
        },
        content: {
          type: "string",
          description: "The team brief content in markdown.",
        },
      },
      required: ["workspace_id", "content"],
    },
  },
  {
    name: "update_user_brief",
    description:
      "Update the user's personal brief. Captures communication preferences, working style, role, and domain expertise. Used to tailor AI responses to this specific user.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description:
            "The user brief content in markdown. Include role, preferences, communication style, domain knowledge.",
        },
      },
      required: ["content"],
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
    case "create_subitem":
      return createSubitem(input, uid);
    case "create_sub_subitem":
      return createSubSubitem(input, uid);
    case "update_item":
    case "update_task": // backward compat alias
      return updateItem(input, uid);
    case "delete_item":
      return deleteItem(input, uid);
    case "move_task":
      return moveTask(input, uid);
    case "search_items":
      return searchItems(input, uid);
    case "get_item_details":
      return getItemDetails(input, uid);
    case "bulk_create_items":
      return bulkCreateItems(input, uid);
    case "bulk_update_items":
      return bulkUpdateItems(input, uid);
    case "get_overdue_items":
      return getOverdueItems(input, uid);
    case "add_update":
      return addUpdate(input, uid, userEmail);
    case "update_project_brief":
      return updateProjectBrief(input, uid);
    case "get_digested_file":
      return getDigestedFile(input, uid);
    case "update_item_brief":
      return updateItemBrief(input, uid);
    case "update_team_brief":
      return updateTeamBrief(input, uid);
    case "update_user_brief":
      return updateUserBrief(input, uid);
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
      tasks: state.tasks.map((t) => {
        const depth = ((input.depth as number) ?? 0);
        const base = {
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
          recentUpdates: (t.updates || []).slice(-3).map((u) => ({
            text: u.text,
            author: u.author,
            date: u.createdAt,
          })),
        };
        if (depth === 0) {
          return { ...base, subitemCount: t.subitems?.length || 0 };
        }
        return {
          ...base,
          subitems: (t.subitems || []).map((s) => {
            const subBase = {
              id: s.id, name: s.name, status: s.status,
              itemType: s.itemTypeId || null,
              assignees: s.assignees, start: s.start, duration: s.duration,
            };
            if (depth === 1) {
              return { ...subBase, subSubitemCount: s.subitems?.length || 0 };
            }
            return {
              ...subBase,
              subSubitems: (s.subitems || []).map((ss) => ({
                id: ss.id, name: ss.name, status: ss.status,
                itemType: ss.itemTypeId || null,
                assignees: ss.assignees, start: ss.start, duration: ss.duration,
              })),
            };
          }),
        };
      }),
    },
  });
}

/** Get the hybridSync Firestore ref for a user's projects array */
function getHybridRef(uid: string): admin.firestore.DocumentReference {
  return db()
    .collection("artifacts")
    .doc("my-manager-app")
    .collection("users")
    .doc(uid)
    .collection("projects")
    .doc("pmai_projects");
}

async function createTask(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  logger.info(`[createTask] Starting: project=${projectId}, name=${input.name}, uid=${uid}`);
  await requireEditPermission(projectId, uid);

  const hybridRef = getHybridRef(uid);
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
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) throw new Error(`Project ${projectId} not found`);
    projects[idx].tasks = [...(projects[idx].tasks || []), newTask];
    txn.update(hybridRef, { value: JSON.stringify(projects) });
    logger.info(`[createTask] Written to hybridSync, taskId=${taskId}`);
  });

  return JSON.stringify({
    success: true,
    task: { id: taskId, name: newTask.name },
    message: `Created task "${newTask.name}" in the project.`,
  });
}

async function createSubitem(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  await requireEditPermission(projectId, uid);

  const hybridRef = getHybridRef(uid);
  const subitemId = `s${Date.now()}`;
  const newSubitem = {
    id: subitemId,
    name: input.name as string,
    status: (input.status as string) || "pending",
    jobTypeId: (input.job_type as string) || "",
    itemTypeId: (input.item_type as string) || "",
    assignees: (input.assignees as string[]) || [],
    start: (input.start_date as string) || null,
    duration: (input.duration as number) || null,
    subitems: [],
    updates: [],
    files: [],
  };

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const pIdx = projects.findIndex((p) => p.id === projectId);
    if (pIdx === -1) throw new Error(`Project ${projectId} not found`);
    const task = (projects[pIdx].tasks || []).find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    task.subitems = [...(task.subitems || []), newSubitem];
    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  return JSON.stringify({
    success: true,
    subitem: { id: subitemId, name: newSubitem.name, parentTaskId: taskId },
    message: `Created subitem "${newSubitem.name}" under task "${taskId}".`,
  });
}

async function createSubSubitem(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const subitemId = input.subitem_id as string;
  await requireEditPermission(projectId, uid);

  const hybridRef = getHybridRef(uid);
  const subSubitemId = `ss${Date.now()}`;
  const newSubSubitem = {
    id: subSubitemId,
    name: input.name as string,
    status: (input.status as string) || "pending",
    jobTypeId: (input.job_type as string) || "",
    itemTypeId: (input.item_type as string) || "",
    assignees: (input.assignees as string[]) || [],
    start: (input.start_date as string) || null,
    duration: (input.duration as number) || null,
    updates: [],
    files: [],
  };

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const pIdx = projects.findIndex((p) => p.id === projectId);
    if (pIdx === -1) throw new Error(`Project ${projectId} not found`);
    const task = (projects[pIdx].tasks || []).find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const subitem = (task.subitems || []).find((s: { id: string }) => s.id === subitemId);
    if (!subitem) throw new Error(`Subitem ${subitemId} not found`);
    subitem.subitems = [...(subitem.subitems || []), newSubSubitem];
    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  return JSON.stringify({
    success: true,
    subSubitem: { id: subSubitemId, name: newSubSubitem.name, parentSubitemId: subitemId },
    message: `Created sub-subitem "${newSubSubitem.name}" under subitem "${subitemId}".`,
  });
}

/** Apply field updates to any item-shaped object. */
function applyItemUpdates(item: Record<string, unknown>, input: ToolInput): void {
  if (input.name !== undefined) item.name = input.name as string;
  if (input.status !== undefined) item.status = input.status as string;
  if (input.job_type !== undefined) item.jobTypeId = input.job_type as string;
  if (input.item_type !== undefined) item.itemTypeId = input.item_type as string;
  if (input.assignees !== undefined) item.assignees = input.assignees as string[];
  if (input.start_date !== undefined) item.start = input.start_date as string | null;
  if (input.duration !== undefined) item.duration = input.duration as number | null;
  if (input.priority !== undefined) item.priority = input.priority as string;
}

/** Navigate to a specific item in the project hierarchy. */
function findItem(
  project: BoardState,
  taskId: string,
  subitemId?: string,
  subSubitemId?: string,
): { item: Record<string, unknown>; type: string } {
  const task = (project.tasks || []).find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found.`);

  if (!subitemId) return { item: task as unknown as Record<string, unknown>, type: "task" };

  const subitem = (task.subitems || []).find((s: { id: string }) => s.id === subitemId);
  if (!subitem) throw new Error(`Subitem ${subitemId} not found under task ${taskId}.`);

  if (!subSubitemId) return { item: subitem as unknown as Record<string, unknown>, type: "subitem" };

  const subSubitems = (subitem as unknown as { subitems?: Array<{ id: string }> }).subitems || [];
  const subSubitem = subSubitems.find((ss) => ss.id === subSubitemId);
  if (!subSubitem) throw new Error(`Sub-subitem ${subSubitemId} not found under subitem ${subitemId}.`);

  return { item: subSubitem as unknown as Record<string, unknown>, type: "sub-subitem" };
}

async function updateItem(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const subitemId = input.subitem_id as string | undefined;
  const subSubitemId = input.sub_subitem_id as string | undefined;
  await requireEditPermission(projectId, uid);

  const hybridRef = getHybridRef(uid);
  let updatedItem: Record<string, unknown> = {};

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const projectIdx = projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) throw new Error(`Project ${projectId} not found`);

    const { item } = findItem(projects[projectIdx], taskId, subitemId, subSubitemId);
    applyItemUpdates(item, input);
    updatedItem = { ...item };
    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  const targetType = subSubitemId ? "sub-subitem" : subitemId ? "subitem" : "task";
  return JSON.stringify({
    success: true,
    message: `Updated ${targetType} "${updatedItem.name}".`,
    item: {
      id: updatedItem.id,
      taskId,
      subitemId: subitemId || null,
      subSubitemId: subSubitemId || null,
      name: updatedItem.name,
      status: updatedItem.status,
      start: updatedItem.start,
      duration: updatedItem.duration,
      assignees: updatedItem.assignees,
      priority: updatedItem.priority,
    },
  });
}

async function deleteItem(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const subitemId = input.subitem_id as string | undefined;
  const subSubitemId = input.sub_subitem_id as string | undefined;
  await requireEditPermission(projectId, uid);

  const hybridRef = getHybridRef(uid);
  let deletedName = "";
  let deletedType = "";

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const projectIdx = projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) throw new Error(`Project ${projectId} not found`);

    const project = projects[projectIdx];
    const tasks = project.tasks || [];

    if (!subitemId) {
      // Delete top-level task
      const taskIdx = tasks.findIndex((t) => t.id === taskId);
      if (taskIdx === -1) throw new Error(`Task ${taskId} not found.`);
      deletedName = tasks[taskIdx].name;
      deletedType = "task";
      tasks.splice(taskIdx, 1);
      project.tasks = tasks;
    } else {
      const task = tasks.find((t) => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found.`);
      const subitems = task.subitems || [];

      if (!subSubitemId) {
        // Delete subitem
        const subIdx = subitems.findIndex((s: { id: string }) => s.id === subitemId);
        if (subIdx === -1) throw new Error(`Subitem ${subitemId} not found.`);
        deletedName = (subitems[subIdx] as { name: string }).name;
        deletedType = "subitem";
        subitems.splice(subIdx, 1);
        task.subitems = subitems;
      } else {
        // Delete sub-subitem
        const subitem = subitems.find((s: { id: string }) => s.id === subitemId) as unknown as {
          subitems?: Array<{ id: string; name: string }>;
        };
        if (!subitem) throw new Error(`Subitem ${subitemId} not found.`);
        const subSubs = subitem.subitems || [];
        const ssIdx = subSubs.findIndex((ss) => ss.id === subSubitemId);
        if (ssIdx === -1) throw new Error(`Sub-subitem ${subSubitemId} not found.`);
        deletedName = subSubs[ssIdx].name;
        deletedType = "sub-subitem";
        subSubs.splice(ssIdx, 1);
        subitem.subitems = subSubs;
      }
    }

    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  return JSON.stringify({
    success: true,
    message: `Deleted ${deletedType} "${deletedName}" and all its children.`,
  });
}

async function moveTask(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const targetGroupId = input.target_group_id as string;
  await requireEditPermission(projectId, uid);

  const hybridRef = getHybridRef(uid);
  let taskName = "";
  let oldGroupName = "";
  let newGroupName = "";

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const projectIdx = projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) throw new Error(`Project ${projectId} not found`);

    const project = projects[projectIdx];
    const task = (project.tasks || []).find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    const targetGroup = project.groups.find((g) => g.id === targetGroupId);
    if (!targetGroup) throw new Error(`Group ${targetGroupId} not found.`);

    const oldGroup = project.groups.find((g) => g.id === task.groupId);
    oldGroupName = oldGroup?.name || task.groupId;
    newGroupName = targetGroup.name;
    taskName = task.name;
    task.groupId = targetGroupId;

    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  return JSON.stringify({
    success: true,
    message: `Moved task "${taskName}" from "${oldGroupName}" to "${newGroupName}".`,
  });
}

/** Read board state from hybridRef for the freshest data (includes items AI just created). */
async function getBoardStateFromHybrid(
  uid: string,
  projectId: string,
): Promise<BoardState | null> {
  const hybridRef = getHybridRef(uid);
  const snap = await hybridRef.get();
  if (!snap.exists) return null;
  try {
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    return projects.find((p) => p.id === projectId) || null;
  } catch {
    return null;
  }
}

async function searchItems(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const perms = await getProjectPermissions(db(), projectId, uid);
  if (!perms?.canView) {
    return JSON.stringify({ error: "You don't have access to this project." });
  }

  // Read from hybridRef first (freshest), fall back to state/main
  const state = await getBoardStateFromHybrid(uid, projectId) || await getBoardState(projectId);
  if (!state) return JSON.stringify({ error: "Project state not found." });

  const query = (input.query as string)?.toLowerCase();
  const statusFilter = input.status as string | undefined;
  const dateFrom = input.date_from as string | undefined;
  const dateTo = input.date_to as string | undefined;
  const itemTypeFilter = input.item_type as string | undefined;
  const levelFilter = input.level as string | undefined;
  const parentTaskFilter = input.parent_task_id as string | undefined;

  const groupMap = new Map(state.groups.map((g) => [g.id, g.name]));
  const results: Array<Record<string, unknown>> = [];
  const MAX_RESULTS = 50;

  function matchesFilters(item: {
    name: string; status: string; start: string | null;
    itemTypeId?: string;
  }): boolean {
    if (query && !item.name.toLowerCase().includes(query)) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (itemTypeFilter && item.itemTypeId !== itemTypeFilter) return false;
    if (dateFrom && (!item.start || item.start < dateFrom)) return false;
    if (dateTo && (!item.start || item.start > dateTo)) return false;
    return true;
  }

  for (const task of state.tasks || []) {
    if (results.length >= MAX_RESULTS) break;
    if (parentTaskFilter && task.id !== parentTaskFilter) continue;
    const groupName = groupMap.get(task.groupId) || task.groupId;

    if ((!levelFilter || levelFilter === "task") && !parentTaskFilter && matchesFilters({ ...task, itemTypeId: undefined })) {
      results.push({
        id: task.id, name: task.name, status: task.status, type: "task",
        path: `${groupName} > ${task.name}`,
        taskId: task.id, start: task.start, duration: task.duration,
        assignees: task.assignees, priority: task.priority,
      });
    }

    for (const sub of task.subitems || []) {
      if (results.length >= MAX_RESULTS) break;
      if ((!levelFilter || levelFilter === "subitem") &&
          matchesFilters(sub as { name: string; status: string; start: string | null; itemTypeId?: string })) {
        results.push({
          id: sub.id, name: sub.name, status: sub.status, type: "subitem",
          itemType: sub.itemTypeId || null,
          path: `${groupName} > ${task.name} > ${sub.name}`,
          taskId: task.id, subitemId: sub.id,
          start: sub.start, duration: sub.duration, assignees: sub.assignees,
        });
      }

      for (const ss of sub.subitems || []) {
        if (results.length >= MAX_RESULTS) break;
        if ((!levelFilter || levelFilter === "sub_subitem") &&
            matchesFilters(ss as { name: string; status: string; start: string | null; itemTypeId?: string })) {
          results.push({
            id: ss.id, name: ss.name, status: ss.status, type: "sub_subitem",
            itemType: ss.itemTypeId || null,
            path: `${groupName} > ${task.name} > ${sub.name} > ${ss.name}`,
            taskId: task.id, subitemId: sub.id, subSubitemId: ss.id,
            start: ss.start, duration: ss.duration, assignees: ss.assignees,
          });
        }
      }
    }
  }

  return JSON.stringify({
    results,
    count: results.length,
    message: results.length === 0 ? "No items found matching your filters." : `Found ${results.length} item(s).`,
  });
}

async function getItemDetails(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const subitemId = input.subitem_id as string | undefined;
  const subSubitemId = input.sub_subitem_id as string | undefined;

  const perms = await getProjectPermissions(db(), projectId, uid);
  if (!perms?.canView) {
    return JSON.stringify({ error: "You don't have access to this project." });
  }

  const state = await getBoardStateFromHybrid(uid, projectId) || await getBoardState(projectId);
  if (!state) return JSON.stringify({ error: "Project state not found." });

  const task = (state.tasks || []).find((t) => t.id === taskId);
  if (!task) return JSON.stringify({ error: `Task ${taskId} not found.` });

  // Build composite ID for brief lookup
  let compositeId = taskId;
  if (subitemId) compositeId += `__${subitemId}`;
  if (subSubitemId) compositeId += `__${subSubitemId}`;

  // Fetch brief
  let brief: string | null = null;
  try {
    const briefSnap = await db()
      .collection("projects").doc(projectId)
      .collection("itemBriefs").doc(compositeId).get();
    if (briefSnap.exists) {
      brief = (briefSnap.data() as { content?: string })?.content || null;
    }
  } catch { /* no brief */ }

  if (subSubitemId && subitemId) {
    // Return sub-subitem details
    const subitem = (task.subitems || []).find((s: { id: string }) => s.id === subitemId);
    if (!subitem) return JSON.stringify({ error: `Subitem ${subitemId} not found.` });
    const subSubs = (subitem as unknown as { subitems?: Array<Record<string, unknown>> }).subitems || [];
    const ss = subSubs.find((x) => (x as { id: string }).id === subSubitemId);
    if (!ss) return JSON.stringify({ error: `Sub-subitem ${subSubitemId} not found.` });

    return JSON.stringify({
      item: ss,
      type: "sub-subitem",
      path: `${task.name} > ${(subitem as { name: string }).name} > ${(ss as { name: string }).name}`,
      brief,
    });
  }

  if (subitemId) {
    // Return subitem with its sub-subitems
    const subitem = (task.subitems || []).find((s: { id: string }) => s.id === subitemId) as Record<string, unknown> | undefined;
    if (!subitem) return JSON.stringify({ error: `Subitem ${subitemId} not found.` });

    // Fetch briefs for sub-subitems
    const subSubs = (subitem.subitems as Array<Record<string, unknown>> || []);
    const subSubBriefs: Record<string, string> = {};
    if (subSubs.length > 0) {
      const briefPromises = subSubs.map(async (ss) => {
        try {
          const cid = `${taskId}__${subitemId}__${(ss as { id: string }).id}`;
          const snap = await db().collection("projects").doc(projectId)
            .collection("itemBriefs").doc(cid).get();
          if (snap.exists) {
            subSubBriefs[(ss as { id: string }).id] = (snap.data() as { content: string }).content;
          }
        } catch { /* skip */ }
      });
      await Promise.all(briefPromises);
    }

    return JSON.stringify({
      item: subitem,
      type: "subitem",
      path: `${task.name} > ${subitem.name}`,
      brief,
      children: subSubs.map((ss) => ({
        ...(ss as object),
        brief: subSubBriefs[(ss as { id: string }).id] || null,
      })),
    });
  }

  // Return full task with all nested children
  // Fetch briefs for subitems
  const subitemBriefs: Record<string, string> = {};
  const subitems = task.subitems || [];
  if (subitems.length > 0) {
    const briefPromises = subitems.map(async (s: { id: string }) => {
      try {
        const cid = `${taskId}__${s.id}`;
        const snap = await db().collection("projects").doc(projectId)
          .collection("itemBriefs").doc(cid).get();
        if (snap.exists) {
          subitemBriefs[s.id] = (snap.data() as { content: string }).content;
        }
      } catch { /* skip */ }
    });
    await Promise.all(briefPromises);
  }

  return JSON.stringify({
    item: {
      id: task.id, name: task.name, status: task.status,
      groupId: task.groupId, jobType: task.jobTypeId,
      assignees: task.assignees, start: task.start, duration: task.duration,
      progress: task.progress, priority: task.priority,
      updates: (task.updates || []).slice(-10),
    },
    type: "task",
    brief,
    children: subitems.map((s: { id: string; name: string; status: string }) => ({
      ...(s as object),
      brief: subitemBriefs[s.id] || null,
    })),
  });
}

async function bulkCreateItems(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const items = input.items as Array<Record<string, unknown>>;

  if (!items || items.length === 0) {
    return JSON.stringify({ error: "No items provided." });
  }
  if (items.length > 50) {
    return JSON.stringify({ error: "Maximum 50 items per bulk_create_items call." });
  }

  await requireEditPermission(projectId, uid);
  const hybridRef = getHybridRef(uid);
  const idMap: Record<string, string> = {};
  const created: Array<{ tempId: string | null; realId: string; name: string; type: string }> = [];
  let counter = 0;

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const projectIdx = projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) throw new Error(`Project ${projectId} not found`);
    const project = projects[projectIdx];

    for (const item of items) {
      const type = item.type as string;
      const name = item.name as string;
      const tempId = item.temp_id as string | undefined;
      const now = Date.now() + counter++;

      if (type === "task") {
        const taskId = `t${now}`;
        const newTask = {
          id: taskId,
          groupId: (item.group_id as string) || (project.groups[0]?.id || ""),
          name,
          status: (item.status as string) || "pending",
          jobTypeId: (item.job_type as string) || "",
          assignees: (item.assignees as string[]) || [],
          start: (item.start_date as string) || null,
          duration: (item.duration as number) || null,
          progress: 0,
          priority: (item.priority as string) || "",
          subitems: [],
          updates: [],
        };
        project.tasks = [...(project.tasks || []), newTask];
        if (tempId) idMap[tempId] = taskId;
        created.push({ tempId: tempId || null, realId: taskId, name, type: "task" });
      } else if (type === "subitem") {
        const subitemId = `s${now}`;
        const parentTaskId = resolveId(item.parent_task_id as string, idMap);
        const task = (project.tasks || []).find((t) => t.id === parentTaskId);
        if (!task) throw new Error(`Parent task ${parentTaskId} not found for subitem "${name}".`);

        const newSubitem = {
          id: subitemId, name,
          status: (item.status as string) || "pending",
          jobTypeId: (item.job_type as string) || "",
          itemTypeId: (item.item_type as string) || "",
          assignees: (item.assignees as string[]) || [],
          start: (item.start_date as string) || null,
          duration: (item.duration as number) || null,
          subitems: [],
        };
        task.subitems = [...(task.subitems || []), newSubitem];
        if (tempId) idMap[tempId] = subitemId;
        created.push({ tempId: tempId || null, realId: subitemId, name, type: "subitem" });
      } else if (type === "sub_subitem") {
        const subSubitemId = `ss${now}`;
        const parentTaskId = resolveId(item.parent_task_id as string, idMap);
        const parentSubitemId = resolveId(item.parent_subitem_id as string, idMap);
        const task = (project.tasks || []).find((t) => t.id === parentTaskId);
        if (!task) throw new Error(`Parent task ${parentTaskId} not found for sub-subitem "${name}".`);
        const subitem = (task.subitems || []).find((s: { id: string }) => s.id === parentSubitemId) as
          unknown as { subitems?: Array<unknown> } | undefined;
        if (!subitem) throw new Error(`Parent subitem ${parentSubitemId} not found for sub-subitem "${name}".`);

        const newSubSubitem = {
          id: subSubitemId, name,
          status: (item.status as string) || "pending",
          jobTypeId: (item.job_type as string) || "",
          itemTypeId: (item.item_type as string) || "",
          assignees: (item.assignees as string[]) || [],
          start: (item.start_date as string) || null,
          duration: (item.duration as number) || null,
        };
        subitem.subitems = [...(subitem.subitems || []), newSubSubitem];
        if (tempId) idMap[tempId] = subSubitemId;
        created.push({ tempId: tempId || null, realId: subSubitemId, name, type: "sub_subitem" });
      } else {
        throw new Error(`Unknown item type "${type}" for item "${name}".`);
      }
    }

    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  return JSON.stringify({
    success: true,
    created,
    idMap,
    message: `Created ${created.length} item(s).`,
  });
}

/** Resolve a temp_id or real ID using the idMap. */
function resolveId(id: string | undefined, idMap: Record<string, string>): string {
  if (!id) throw new Error("Missing parent ID.");
  return idMap[id] || id;
}

async function bulkUpdateItems(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const updates = input.updates as Array<Record<string, unknown>>;

  if (!updates || updates.length === 0) {
    return JSON.stringify({ error: "No updates provided." });
  }
  if (updates.length > 50) {
    return JSON.stringify({ error: "Maximum 50 updates per bulk_update_items call." });
  }

  await requireEditPermission(projectId, uid);
  const hybridRef = getHybridRef(uid);
  const results: Array<{ taskId: string; subitemId?: string; subSubitemId?: string; name: string; success: boolean }> = [];

  await db().runTransaction(async (txn) => {
    const snap = await txn.get(hybridRef);
    if (!snap.exists) throw new Error("User project data not found");
    const projects = JSON.parse((snap.data() as { value: string }).value) as BoardState[];
    const projectIdx = projects.findIndex((p) => p.id === projectId);
    if (projectIdx === -1) throw new Error(`Project ${projectId} not found`);

    for (const update of updates) {
      const taskId = update.task_id as string;
      const subitemId = update.subitem_id as string | undefined;
      const subSubitemId = update.sub_subitem_id as string | undefined;

      try {
        const { item } = findItem(projects[projectIdx], taskId, subitemId, subSubitemId);
        applyItemUpdates(item, update as ToolInput);
        results.push({
          taskId, subitemId, subSubitemId,
          name: item.name as string, success: true,
        });
      } catch (err) {
        results.push({
          taskId, subitemId, subSubitemId,
          name: (update.name as string) || "unknown",
          success: false,
        });
      }
    }

    txn.update(hybridRef, { value: JSON.stringify(projects) });
  });

  const successCount = results.filter((r) => r.success).length;
  return JSON.stringify({
    success: true,
    results,
    message: `Updated ${successCount} of ${updates.length} item(s).`,
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
    subitemId?: string;
    subitemName?: string;
    subSubitemId?: string;
    subSubitemName?: string;
    type: string;
    path: string;
    status: string;
    endDate: string;
  }> = [];

  function checkOverdue(
    start: string | null, duration: number | null, status: string,
  ): string | null {
    if (status === "done" || !start || !duration) return null;
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + duration);
    const endStr = endDate.toISOString().split("T")[0];
    return endStr < today ? endStr : null;
  }

  for (const pid of projectIds) {
    const perms = await getProjectPermissions(db(), pid, uid);
    if (!perms?.canView) continue;

    const state = await getBoardState(pid);
    if (!state) continue;
    if (state.archivedAt) continue;

    const projDoc = await db().collection("projects").doc(pid).get();
    const projectName = (projDoc.data()?.name as string) || "Untitled";

    for (const task of state.tasks || []) {
      const taskEnd = checkOverdue(task.start, task.duration, task.status);
      if (taskEnd) {
        overdue.push({
          projectId: pid, projectName,
          taskId: task.id, taskName: task.name,
          type: "task", path: task.name,
          status: task.status, endDate: taskEnd,
        });
      }

      for (const sub of task.subitems || []) {
        const subEnd = checkOverdue(sub.start, sub.duration, sub.status);
        if (subEnd) {
          overdue.push({
            projectId: pid, projectName,
            taskId: task.id, taskName: task.name,
            subitemId: sub.id, subitemName: sub.name,
            type: "subitem", path: `${task.name} > ${sub.name}`,
            status: sub.status, endDate: subEnd,
          });
        }

        for (const ss of sub.subitems || []) {
          const ssEnd = checkOverdue(ss.start, ss.duration, ss.status);
          if (ssEnd) {
            overdue.push({
              projectId: pid, projectName,
              taskId: task.id, taskName: task.name,
              subitemId: sub.id, subitemName: sub.name,
              subSubitemId: ss.id, subSubitemName: ss.name,
              type: "sub-subitem", path: `${task.name} > ${sub.name} > ${ss.name}`,
              status: ss.status, endDate: ssEnd,
            });
          }
        }
      }
    }
  }

  return JSON.stringify({
    overdue,
    count: overdue.length,
    message:
      overdue.length === 0
        ? "No overdue items found."
        : `Found ${overdue.length} overdue item(s).`,
  });
}

async function addUpdate(
  input: ToolInput,
  uid: string,
  userEmail: string
): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const subitemId = input.subitem_id as string | undefined;
  const subSubitemId = input.sub_subitem_id as string | undefined;
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

    // Navigate to the target item — updates are stored on the top-level task
    // but we note which subitem the update is about via a prefix
    const tasks = state.tasks || [];
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) throw new Error(`Task ${taskId} not found.`);

    const task = tasks[taskIndex];

    // Verify the target exists if targeting a subitem
    if (subitemId) {
      const sub = (task.subitems || []).find((s: { id: string }) => s.id === subitemId);
      if (!sub) throw new Error(`Subitem ${subitemId} not found.`);
      if (subSubitemId) {
        const subSubs = (sub as unknown as { subitems?: Array<{ id: string }> }).subitems || [];
        if (!subSubs.find((ss) => ss.id === subSubitemId)) {
          throw new Error(`Sub-subitem ${subSubitemId} not found.`);
        }
      }
    }

    const updates = task.updates || [];
    const updateEntry: { id: string; text: string; author: string; createdAt: string; targetSubitemId?: string; targetSubSubitemId?: string } = {
      id: `u${Date.now()}`,
      text,
      author: userEmail,
      createdAt: new Date().toISOString(),
    };
    if (subitemId) updateEntry.targetSubitemId = subitemId;
    if (subSubitemId) updateEntry.targetSubSubitemId = subSubitemId;

    updates.push(updateEntry);
    task.updates = updates;
    tasks[taskIndex] = task;
    state.tasks = tasks;
    txn.update(stateRef, serializeStateUpdate(state, uid));
  });

  const targetType = subSubitemId ? "sub-subitem" : subitemId ? "subitem" : "task";
  return JSON.stringify({
    success: true,
    message: `Added update to ${targetType}.`,
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

// ─── Drill-Down Tool Implementations ────────────────────────────

async function getDigestedFile(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const fileId = input.file_id as string;

  const perms = await getProjectPermissions(db(), projectId, uid);
  if (!perms || !perms.canView) {
    return JSON.stringify({ error: "You don't have access to this project." });
  }

  const snap = await db()
    .collection("projects")
    .doc(projectId)
    .collection("fileDigests")
    .doc(fileId)
    .get();

  if (!snap.exists) {
    return JSON.stringify({ error: `No digest found for file ${fileId}.` });
  }

  const data = snap.data() as {
    fileId: string;
    status: string;
    extractedText?: string;
    speakerLabels?: Record<string, string>;
  };

  if (data.status !== "done" || !data.extractedText) {
    return JSON.stringify({
      error: `File digest is not ready (status: ${data.status}).`,
    });
  }

  // Apply speaker labels to the transcript
  let text = data.extractedText;
  if (data.speakerLabels) {
    for (const [key, name] of Object.entries(data.speakerLabels)) {
      text = text.replace(new RegExp(`\\[${key}\\]`, "g"), `[${name}]`);
    }
  }

  return JSON.stringify({
    fileId: data.fileId,
    textLength: text.length,
    content: text,
  });
}

// ─── Brief Tool Implementations ─────────────────────────────────

async function updateItemBrief(input: ToolInput, uid: string): Promise<string> {
  const projectId = input.project_id as string;
  const taskId = input.task_id as string;
  const subitemId = input.subitem_id as string | undefined;
  const subSubitemId = input.sub_subitem_id as string | undefined;
  const content = input.content as string;

  await requireEditPermission(projectId, uid);

  // Build composite ID: taskId or taskId__subitemId or taskId__subitemId__subSubitemId
  let compositeId = taskId;
  if (subitemId) compositeId += `__${subitemId}`;
  if (subSubitemId) compositeId += `__${subSubitemId}`;

  const ref = db()
    .collection("projects")
    .doc(projectId)
    .collection("itemBriefs")
    .doc(compositeId);

  await ref.set({
    content,
    updatedAt: new Date().toISOString(),
    updatedBy: "ai",
  });

  return JSON.stringify({
    success: true,
    message: `Item brief updated for ${compositeId}.`,
  });
}

async function updateTeamBrief(input: ToolInput, _uid: string): Promise<string> {
  const workspaceId = input.workspace_id as string;
  const content = input.content as string;

  if (!workspaceId) {
    return JSON.stringify({ error: "workspace_id is required." });
  }

  const ref = db().collection("workspaceMemory").doc(workspaceId);

  await ref.set(
    {
      content,
      updatedAt: new Date().toISOString(),
      updatedBy: "ai",
    },
    { merge: true },
  );

  return JSON.stringify({
    success: true,
    message: "Team brief updated.",
  });
}

async function updateUserBrief(input: ToolInput, uid: string): Promise<string> {
  const content = input.content as string;

  const ref = db()
    .collection("users")
    .doc(uid)
    .collection("aiMemory")
    .doc("brief");

  await ref.set({
    content,
    updatedAt: new Date().toISOString(),
    updatedBy: "ai",
  });

  return JSON.stringify({
    success: true,
    message: "User brief updated.",
  });
}
