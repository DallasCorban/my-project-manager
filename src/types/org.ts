// Organization types — Phase 1 definitions (no UI or Firestore writes yet).

export type OrgRole = 'owner' | 'admin' | 'member' | 'guest';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  avatarUrl?: string;
  plan: 'free' | 'team' | 'business';
  createdBy: string;
  createdAt: unknown;
  archivedAt?: unknown;
  settings?: OrgSettings;
}

export interface OrgSettings {
  defaultMemberRole: OrgRole;
  /** If set, users signing up with this email domain are auto-added. */
  inviteDomain?: string;
}

export interface OrgMember {
  uid: string;
  email: string;
  orgRole: OrgRole;
  joinedAt: unknown;
  invitedBy?: string;
}
