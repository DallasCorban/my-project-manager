import type { Item } from './item';

export interface Group {
  id: string;
  name: string;
  color: string;
}

export interface Board {
  id: string;
  workspaceId: string;
  workspaceName?: string;
  name: string;
  status: string;
  groups: Group[];
  tasks: Item[];
}
