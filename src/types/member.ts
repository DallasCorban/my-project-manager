export type Role = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer' | 'contractor';

export interface Member {
  id?: string;
  uid: string;
  email: string;
  role: Role;
  baseRole?: Role | null;
  accessUntil?: Date | string | null;
  status: 'active' | 'inactive';
  inviteId?: string;
  joinedAt?: unknown;
}

export interface Invite {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  baseRole?: Role | null;
  accessUntil?: unknown;
  status: 'pending' | 'accepted' | 'revoked';
  token: string;
  createdAt?: unknown;
  invitedBy: string;
  invitedByEmail: string;
}

export interface AccessRequest {
  uid: string;
  email: string;
  displayName?: string;
  message?: string;
  createdAt?: unknown;
}

export interface MemberPermissions {
  role: string;
  rank: number;
  canView: boolean;
  canEdit: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canEditFiles: boolean;
  canManageMembers: boolean;
  canManageFileAccess: boolean;
}

export interface RoleOption {
  value: Role;
  label: string;
}
