export interface Workspace {
  id: string;
  name: string;
  type: 'workspace';
  archivedAt?: string | null;
}

export interface Dashboard {
  id: string;
  name: string;
  type: 'dashboard';
  includedWorkspaces: string[];
}
