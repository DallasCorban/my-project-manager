// Permission system — role ranks, member helpers, and guard functions.
// Ported from App.jsx:2587-2638 (permissions) and 266-289 (member helpers).

import type { Role, Member, MemberPermissions } from '../types/member';
import { ROLE_RANK } from '../config/constants';

// --- Member helpers ---

/**
 * Get the effective role for a member.
 * Contractors use their baseRole; everyone else uses their actual role.
 */
export function getMemberEffectiveRole(member: Member | null | undefined): Exclude<Role, 'contractor'> {
  if (!member) return 'viewer';
  if (member.role === 'contractor') {
    return (member.baseRole as Exclude<Role, 'contractor'>) || 'viewer';
  }
  return (member.role as Exclude<Role, 'contractor'>) || 'viewer';
}

/**
 * Extract the access expiry date from a member, handling various formats.
 */
export function getMemberAccessUntil(member: Member | null | undefined): Date | null {
  if (!member || !member.accessUntil) return null;

  const val = member.accessUntil;
  if (val instanceof Date) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.toDate === 'function') {
      return (obj.toDate as () => Date)();
    }
  }
  return null;
}

/**
 * Check if a member currently has active access.
 * Non-contractors are always active. Contractors are active if accessUntil is in the future.
 */
export function isMemberActive(member: Member | null | undefined): boolean {
  if (!member) return false;
  if (member.role !== 'contractor') return true;
  const until = getMemberAccessUntil(member);
  if (!until) return false;
  return until.getTime() > Date.now();
}

// --- Permission evaluation ---

/**
 * Compute the permission set for a member based on their role and active status.
 */
export function getMemberPermissions(member: Member | null | undefined): MemberPermissions {
  const effectiveRole = getMemberEffectiveRole(member);
  const rank = ROLE_RANK[effectiveRole] ?? 0;
  const active = isMemberActive(member);

  if (!active) {
    return {
      role: effectiveRole,
      rank,
      canView: false,
      canEdit: false,
      canUpload: false,
      canDownload: false,
      canEditFiles: false,
      canManageMembers: false,
      canManageFileAccess: false,
    };
  }

  return {
    role: effectiveRole,
    rank,
    canView: rank >= 1,
    canEdit: rank >= 2,
    canUpload: rank >= 2,
    canDownload: rank >= 2,
    canEditFiles: rank >= 3,
    canManageMembers: rank >= 4,
    canManageFileAccess: rank >= 4,
  };
}

/**
 * Anonymous-aware permission check.
 * Returns viewer permissions with all flags false for anonymous users.
 */
export function getAnonymousPermissions(): MemberPermissions {
  return {
    role: 'viewer',
    rank: 0,
    canView: false,
    canEdit: false,
    canUpload: false,
    canDownload: false,
    canEditFiles: false,
    canManageMembers: false,
    canManageFileAccess: false,
  };
}

/**
 * Check if a member can write project state (contributor rank or higher).
 */
export function canWriteProjectState(member: Member | null | undefined): boolean {
  const perms = getMemberPermissions(member);
  return perms.rank >= 2; // contributor+
}

/**
 * Check if a member can edit project content (contributor rank or higher).
 */
export function canEditProject(member: Member | null | undefined): boolean {
  return canWriteProjectState(member);
}

/**
 * Check if a member can manage members and invites (admin rank or higher).
 */
export function canManageProject(member: Member | null | undefined): boolean {
  const perms = getMemberPermissions(member);
  return perms.canManageMembers;
}
