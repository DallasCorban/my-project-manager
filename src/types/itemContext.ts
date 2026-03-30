// ItemContext — rich context for a single item sent to the AI backend.
// Used by the item-level AI tab to give the AI full awareness of the item,
// its hierarchy (parent/child briefs), and its raw data (updates, digested files).

export interface ItemContext {
  // Current item identity
  projectId: string;
  projectName: string;
  taskId: string;
  subitemId: string | null;
  subSubitemId: string | null;
  itemName: string;
  itemType: 'project' | 'deliverable' | 'task' | 'unknown';
  parentName?: string;

  // Current item fields
  status: string;
  assignees: string[];
  priority?: string;
  start: string | null;
  duration: number | null;

  // Current item's raw data (always included)
  updates: ItemUpdate[];
  digestedFiles: DigestedFile[];
  subitems: ItemSummary[];

  // Hierarchy context (adaptive: raw or brief-based depending on budget)
  parentBriefs: HierarchyBrief[];
  childrenContext: ChildContext[];

  // Briefs
  currentItemBrief: string | null;
}

export interface ItemUpdate {
  id: string;
  text: string;
  checklist?: Array<{ text: string; done: boolean }>;
  replies: Array<{ text: string; author: string; createdAt: string }>;
  author: string;
  createdAt: string;
}

export interface DigestedFile {
  fileId: string;
  fileName: string;
  fileType: string;
  extractedText: string;
  speakerLabels?: Record<string, string>;
}

export interface ItemSummary {
  id: string;
  name: string;
  status: string;
  assignees: string[];
  start: string | null;
  duration: number | null;
}

export interface HierarchyBrief {
  name: string;
  type: string;
  brief: string;
}

export interface ChildContext {
  id: string;
  name: string;
  type: string;
  status: string;
  brief?: string;
  updates?: ItemUpdate[];
}
