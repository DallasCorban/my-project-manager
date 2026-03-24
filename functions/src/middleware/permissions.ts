/**
 * Permission helpers — ported from src/services/permissions.ts.
 * Runs server-side in Cloud Functions where security rules are bypassed.
 */
import * as admin from "firebase-admin";

// --- Types (mirrored from client) ---

export type Role =
  | "owner"
  | "admin"
  | "editor"
  | "contributor"
  | "viewer"
  | "contractor";

export interface Member {
  uid: string;
  email: string;
  role: Role;
  baseRole?: Role | null;
  accessUntil?: admin.firestore.Timestamp | string | null;
  status: "active" | "inactive";
}

export interface MemberPermissions {
  role: string;
  rank: number;
  canView: boolean;
  canEdit: boolean;
}

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

// --- Helpers ---

function getEffectiveRole(member: Member): Exclude<Role, "contractor"> {
  if (member.role === "contractor") {
    return (member.baseRole as Exclude<Role, "contractor">) || "viewer";
  }
  return member.role as Exclude<Role, "contractor">;
}

function isMemberActive(member: Member): boolean {
  if (member.role !== "contractor") return true;
  const until = member.accessUntil;
  if (!until) return false;
  const date =
    until instanceof admin.firestore.Timestamp
      ? until.toDate()
      : new Date(until as string);
  return date.getTime() > Date.now();
}

export function getMemberPermissions(member: Member): MemberPermissions {
  const effectiveRole = getEffectiveRole(member);
  const rank = ROLE_RANK[effectiveRole] ?? 0;
  const active = isMemberActive(member);

  return {
    role: effectiveRole,
    rank,
    canView: active && rank >= 1,
    canEdit: active && rank >= 2,
  };
}

// --- Firestore lookup ---

/**
 * Look up a user's membership in a project and return their permissions.
 * Returns null if the user is not a member of the project.
 */
export async function getProjectPermissions(
  db: admin.firestore.Firestore,
  projectId: string,
  uid: string
): Promise<MemberPermissions | null> {
  const memberDoc = await db
    .collection("projects")
    .doc(projectId)
    .collection("members")
    .doc(uid)
    .get();

  if (!memberDoc.exists) return null;

  const member = memberDoc.data() as Member;
  return getMemberPermissions(member);
}
