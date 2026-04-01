// itemContextBuilder — builds rich context for item-level AI chat.
// Uses adaptive character budget: includes raw updates when small enough,
// falls back to briefs for distant hierarchy levels when budget is exceeded.

import type { Board } from '../../types/board';
import type { Item, Subitem, SubSubitem, Update } from '../../types/item';
import type {
  ItemContext, ItemUpdate, DigestedFile, ItemSummary,
  HierarchyBrief, ChildContext,
} from '../../types/itemContext';

/** Max characters for hierarchy context (~8K tokens). */
const CONTEXT_BUDGET = 30_000;

/** Map an item type ID to our hierarchy type. */
function resolveItemType(typeId?: string): ItemContext['itemType'] {
  if (typeId === 'project' || typeId === 'deliverable' || typeId === 'task') return typeId;
  return 'unknown';
}

/** Convert Update[] to ItemUpdate[] (strip HTML from text for token efficiency). */
function mapUpdates(updates?: Update[]): ItemUpdate[] {
  if (!updates?.length) return [];
  return updates.map((u) => ({
    id: u.id,
    text: u.text.replace(/<[^>]+>/g, ''), // strip HTML tags
    checklist: u.checklist?.map((c) => ({ text: c.text, done: c.done })),
    replies: u.replies.map((r) => ({ text: r.text, author: r.author, createdAt: r.createdAt })),
    author: u.author,
    createdAt: u.createdAt,
  }));
}

/** Rough character count for an array of updates. */
function updatesSize(updates: ItemUpdate[]): number {
  return updates.reduce((sum, u) => {
    let size = u.text.length + u.author.length + u.createdAt.length;
    if (u.checklist) size += u.checklist.reduce((s, c) => s + c.text.length + 10, 0);
    size += u.replies.reduce((s, r) => s + r.text.length + r.author.length + 20, 0);
    return sum + size;
  }, 0);
}

interface BuildParams {
  project: Board;
  taskId: string;
  subitemId: string | null;
  subSubitemId: string | null;
  digestedFiles: DigestedFile[];
  briefs: {
    currentItem: string | null;
    project: string | null;
    /** Briefs for parent items in the hierarchy (e.g., parent task, parent subitem). */
    parents: HierarchyBrief[];
    /** Briefs for child items keyed by composite ID. */
    children: Record<string, string>;
  };
}

export function buildItemContext(params: BuildParams): ItemContext {
  const { project, taskId, subitemId, subSubitemId, digestedFiles, briefs } = params;

  // Find the target item in the hierarchy
  const task = project.tasks.find((t) => t.id === taskId);
  if (!task) {
    return emptyContext(params);
  }

  let targetItem: Item | Subitem | SubSubitem = task;
  let parentName: string | undefined;

  if (subitemId) {
    const sub = task.subitems?.find((s) => s.id === subitemId);
    if (sub) {
      parentName = task.name;
      targetItem = sub;

      if (subSubitemId) {
        const subsub = (sub as Subitem).subitems?.find((ss) => ss.id === subSubitemId);
        if (subsub) {
          parentName = sub.name;
          targetItem = subsub;
        }
      }
    }
  }

  // Current item's raw data (always included)
  const currentUpdates = mapUpdates(targetItem.updates);
  const currentSubitems: ItemSummary[] = getSubitems(targetItem);

  // Digested files: only include metadata (name, type) — NOT the full extracted text.
  // The AI can use the get_digested_file tool to drill into specific files on demand.
  // This prevents 40K+ character transcripts from bloating every request.
  const digestedFileSummaries: DigestedFile[] = digestedFiles.map((f) => ({
    fileId: f.fileId,
    fileName: f.fileName,
    fileType: f.fileType,
    extractedText: `[${f.extractedText.length.toLocaleString()} characters — use get_digested_file tool to access full content]`,
    speakerLabels: f.speakerLabels,
  }));

  // Calculate current item size (without full transcript text)
  const currentSize = updatesSize(currentUpdates);

  // Remaining budget for hierarchy context
  let remainingBudget = CONTEXT_BUDGET - currentSize;

  // If current item alone exceeds budget, truncate to most recent updates
  let finalUpdates = currentUpdates;
  if (currentSize > CONTEXT_BUDGET) {
    const updateBudget = CONTEXT_BUDGET - 2000; // 2K margin for metadata
    let accumulated = 0;
    const truncated: ItemUpdate[] = [];
    // Most recent first
    for (let i = currentUpdates.length - 1; i >= 0; i--) {
      const size = updatesSize([currentUpdates[i]]);
      if (accumulated + size > updateBudget && truncated.length > 0) break;
      truncated.unshift(currentUpdates[i]);
      accumulated += size;
    }
    finalUpdates = truncated;
    remainingBudget = 0;
  }

  // Build children context (adaptive: raw vs brief)
  const childrenContext: ChildContext[] = [];
  if (remainingBudget > 0) {
    const children = getChildItems(targetItem, subitemId, subSubitemId);
    for (const child of children) {
      const childUpdates = mapUpdates(child.updates);
      const childSize = updatesSize(childUpdates);
      const compositeId = buildChildCompositeId(taskId, subitemId, subSubitemId, child.id);
      const childBrief = briefs.children[compositeId];

      if (childSize <= remainingBudget && remainingBudget > 1000) {
        // Include raw updates
        childrenContext.push({
          id: child.id,
          name: child.name,
          type: resolveItemType((child as Subitem).itemTypeId),
          status: child.status,
          updates: childUpdates,
        });
        remainingBudget -= childSize;
      } else if (childBrief) {
        // Fall back to brief
        childrenContext.push({
          id: child.id,
          name: child.name,
          type: resolveItemType((child as Subitem).itemTypeId),
          status: child.status,
          brief: childBrief,
        });
        remainingBudget -= childBrief.length;
      } else {
        // No brief, no budget — just include summary
        childrenContext.push({
          id: child.id,
          name: child.name,
          type: resolveItemType((child as Subitem).itemTypeId),
          status: child.status,
        });
      }
    }
  }

  return {
    projectId: project.id,
    projectName: project.name,
    taskId,
    subitemId,
    subSubitemId,
    itemName: targetItem.name,
    itemType: resolveItemType((targetItem as Item).itemTypeId),
    parentName,
    status: targetItem.status,
    assignees: targetItem.assignees || [],
    priority: (targetItem as Item).priority || undefined,
    start: targetItem.start,
    duration: targetItem.duration,
    updates: finalUpdates,
    digestedFiles: digestedFileSummaries,
    subitems: currentSubitems,
    parentBriefs: briefs.parents,
    childrenContext,
    currentItemBrief: briefs.currentItem,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function emptyContext(params: BuildParams): ItemContext {
  return {
    projectId: params.project.id,
    projectName: params.project.name,
    taskId: params.taskId,
    subitemId: params.subitemId,
    subSubitemId: params.subSubitemId,
    itemName: 'Unknown',
    itemType: 'unknown',
    status: '',
    assignees: [],
    start: null,
    duration: null,
    updates: [],
    digestedFiles: [],
    subitems: [],
    parentBriefs: params.briefs.parents,
    childrenContext: [],
    currentItemBrief: null,
  };
}

function getSubitems(item: Item | Subitem | SubSubitem): ItemSummary[] {
  const subs = (item as Item).subitems || (item as Subitem).subitems;
  if (!subs?.length) return [];
  return subs.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    assignees: s.assignees || [],
    start: s.start,
    duration: s.duration,
  }));
}

/** Get the direct children of the current item for hierarchy traversal. */
function getChildItems(
  item: Item | Subitem | SubSubitem,
  _subitemId: string | null,
  _subSubitemId: string | null,
): Array<Subitem | SubSubitem> {
  if ('subitems' in item && item.subitems) {
    return item.subitems as Array<Subitem | SubSubitem>;
  }
  return [];
}

/** Build composite ID for a child relative to its parent location. */
function buildChildCompositeId(
  taskId: string,
  parentSubitemId: string | null,
  parentSubSubitemId: string | null,
  childId: string,
): string {
  // If parent is a top-level task, child is a subitem
  if (!parentSubitemId) return `${taskId}__${childId}`;
  // If parent is a subitem, child is a sub-subitem
  if (!parentSubSubitemId) return `${taskId}__${parentSubitemId}__${childId}`;
  // Sub-subitems don't have children
  return childId;
}
