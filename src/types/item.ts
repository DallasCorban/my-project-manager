import type { ProjectFile } from './file';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Reply {
  id: string;
  text: string;
  author: string;
  createdAt: string;
}

export interface Update {
  id: string;
  text: string;
  checklist?: ChecklistItem[];
  replies: Reply[];
  author: string;
  createdAt: string;
}

export interface SubSubitem {
  id: string;
  name: string;
  start: string | null;      // YYYY-MM-DD date key
  duration: number | null;
  status: string;
  jobTypeId: string;
  assignees: string[];        // member UIDs (or legacy display names)
  itemTypeId?: string;
  updates?: Update[];
  files?: ProjectFile[];
}

export interface Subitem {
  id: string;
  name: string;
  start: string | null;      // YYYY-MM-DD date key
  duration: number | null;
  status: string;
  jobTypeId: string;
  assignees: string[];        // member UIDs (or legacy display names)
  itemTypeId?: string;
  subitems?: SubSubitem[];
  updates?: Update[];
  files?: ProjectFile[];
}

export interface Item {
  id: string;
  groupId: string;
  name: string;
  start: string | null;       // YYYY-MM-DD date key
  duration: number | null;
  progress: number;
  status: string;
  jobTypeId: string;
  assignees: string[];        // member UIDs (or legacy display names)
  priority: string;
  itemTypeId?: string;
  subitems: Subitem[];
  updates?: Update[];
  files?: ProjectFile[];
}
