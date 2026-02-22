export interface Workspace {
  id: string;
  name: string;
  type: 'workspace';
}

export interface Dashboard {
  id: string;
  name: string;
  type: 'dashboard';
  includedWorkspaces: string[];
}
