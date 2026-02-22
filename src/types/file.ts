import type { Role } from './member';

export interface FileAccess {
  minRole: Role;
  allowShareLink: boolean;
  shareToken: string | null;
  revokedAt?: unknown;
  sharedAt?: unknown;
}

export interface ProjectFile {
  id: string;
  projectId?: string;
  taskId?: string;
  subitemId?: string | null;
  name: string;
  size: number;
  type: string;
  url?: string;
  dataUrl?: string;
  storagePath?: string;
  createdAt?: string | unknown;
  createdBy?: string;
  author: string;
  access?: FileAccess;
}
