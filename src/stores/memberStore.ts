// Member store — per-project membership, self-membership, and permissions.
// Manages Firestore listeners for members and computes permissions.

import { create } from 'zustand';
import type { Member, MemberPermissions } from '../types/member';
import {
  getMemberPermissions,
  getAnonymousPermissions,
} from '../services/permissions';
import {
  subscribeToSelfMembership,
  subscribeToProjectMembers,
  discoverMemberProjects,
  discoverOwnedProjects,
  type MembershipInfo,
} from '../services/firebase/memberSync';
import {
  ensureProjectSetup,
} from '../services/firebase/projectSync';
import { useAuthStore } from './authStore';
import type { Board } from '../types/board';

interface MemberState {
  /** Current user's membership per project */
  selfMembershipByProject: Record<string, Member | null>;
  /** All members per project */
  membersByProject: Record<string, Member[]>;
  /** Projects discovered via collection group (user is a member) */
  memberProjects: MembershipInfo[];
  /** Projects owned/created by user */
  ownedProjects: MembershipInfo[];
  /** Set of project IDs that have been ensured in Firestore */
  ensuredProjects: Set<string>;

  // Actions
  setSelfMembership: (projectId: string, member: Member | null) => void;
  setProjectMembers: (projectId: string, members: Member[]) => void;
  setMemberProjects: (projects: MembershipInfo[]) => void;
  setOwnedProjects: (projects: MembershipInfo[]) => void;
  markProjectEnsured: (projectId: string) => void;
}

export const useMemberStore = create<MemberState>((set) => ({
  selfMembershipByProject: {},
  membersByProject: {},
  memberProjects: [],
  ownedProjects: [],
  ensuredProjects: new Set(),

  setSelfMembership: (projectId, member) =>
    set((state) => ({
      selfMembershipByProject: {
        ...state.selfMembershipByProject,
        [projectId]: member,
      },
    })),

  setProjectMembers: (projectId, members) =>
    set((state) => ({
      membersByProject: {
        ...state.membersByProject,
        [projectId]: members,
      },
    })),

  setMemberProjects: (projects) => set({ memberProjects: projects }),
  setOwnedProjects: (projects) => set({ ownedProjects: projects }),

  markProjectEnsured: (projectId) =>
    set((state) => {
      const next = new Set(state.ensuredProjects);
      next.add(projectId);
      return { ensuredProjects: next };
    }),
}));

// --- Listener management ---
const activeListeners = new Map<string, (() => void)[]>();
let discoveryUnsubs: (() => void)[] = [];

/**
 * Start membership listeners for a specific project.
 * Subscribes to self-membership and all project members.
 */
export function startProjectMembershipListeners(projectId: string): void {
  const user = useAuthStore.getState().user;
  if (!user) return;

  // Clean up existing listeners for this project
  stopProjectMembershipListeners(projectId);

  const unsubs: (() => void)[] = [];
  const store = useMemberStore.getState();

  // Self-membership listener
  const selfUnsub = subscribeToSelfMembership(projectId, user.uid, (member) => {
    useMemberStore.getState().setSelfMembership(projectId, member);
  });
  unsubs.push(selfUnsub);

  // All members listener
  const membersUnsub = subscribeToProjectMembers(projectId, (members) => {
    useMemberStore.getState().setProjectMembers(projectId, members);
  });
  unsubs.push(membersUnsub);

  activeListeners.set(projectId, unsubs);
  void store; // used for initial call
}

/**
 * Stop membership listeners for a specific project.
 */
export function stopProjectMembershipListeners(projectId: string): void {
  const unsubs = activeListeners.get(projectId);
  if (unsubs) {
    unsubs.forEach((u) => u());
    activeListeners.delete(projectId);
  }
}

/**
 * Start membership discovery listeners (finds all projects user belongs to).
 */
export function startMembershipDiscovery(): void {
  const user = useAuthStore.getState().user;
  if (!user) return;

  stopMembershipDiscovery();

  const memberUnsub = discoverMemberProjects(user.uid, (projects) => {
    useMemberStore.getState().setMemberProjects(projects);
  });

  const ownedUnsub = discoverOwnedProjects(user.uid, (projects) => {
    useMemberStore.getState().setOwnedProjects(projects);
  });

  discoveryUnsubs = [memberUnsub, ownedUnsub];
}

/**
 * Stop membership discovery listeners.
 */
export function stopMembershipDiscovery(): void {
  discoveryUnsubs.forEach((u) => u());
  discoveryUnsubs = [];
}

/**
 * Stop all membership listeners.
 */
export function cleanupAllMembershipListeners(): void {
  for (const [pid] of activeListeners) {
    stopProjectMembershipListeners(pid);
  }
  stopMembershipDiscovery();
}

/**
 * Ensure a project's metadata and owner membership exist in Firestore.
 * Idempotent — skips if already ensured.
 */
export async function ensureProject(projectId: string, project: Board): Promise<void> {
  const { ensuredProjects, markProjectEnsured } = useMemberStore.getState();
  if (ensuredProjects.has(projectId)) return;

  const user = useAuthStore.getState().user;
  if (!user || user.isAnonymous) return;

  await ensureProjectSetup(projectId, project, user.uid, user.email || '');
  markProjectEnsured(projectId);
}

// --- Permission helpers (from store state) ---

/**
 * Get permissions for the current user on a specific project.
 */
export function getProjectPermissions(projectId: string): MemberPermissions {
  const user = useAuthStore.getState().user;
  if (!user || user.isAnonymous) return getAnonymousPermissions();

  const selfMembership = useMemberStore.getState().selfMembershipByProject[projectId];
  return getMemberPermissions(selfMembership);
}

/**
 * Check if current user can edit a specific project.
 */
export function canEditProjectCheck(projectId: string): boolean {
  const perms = getProjectPermissions(projectId);
  return perms.rank >= 2; // contributor+
}
