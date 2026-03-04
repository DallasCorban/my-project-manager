// Org store — manages organisation state, membership, and workspace subscriptions.

import { create } from 'zustand';
import type { Organization, OrgMember } from '../types/org';
import type { OrgWorkspace, OrgBoardRef } from '../services/firebase/orgSync';
import {
  subscribeToUserOrgs,
  subscribeToOrgMembers,
  subscribeToOrgWorkspaces,
  subscribeToOrgBoardRefs,
} from '../services/firebase/orgSync';
import type { Unsubscribe } from 'firebase/firestore';

interface OrgState {
  // User's orgs
  userOrgs: Organization[];
  setUserOrgs: (orgs: Organization[]) => void;

  // Active org detail
  activeOrgMembers: OrgMember[];
  setActiveOrgMembers: (members: OrgMember[]) => void;
  activeOrgWorkspaces: OrgWorkspace[];
  setActiveOrgWorkspaces: (workspaces: OrgWorkspace[]) => void;
  activeOrgBoardRefs: OrgBoardRef[];
  setActiveOrgBoardRefs: (refs: OrgBoardRef[]) => void;

  // Active org workspace selection (within an org context)
  activeOrgWorkspaceId: string | null;
  setActiveOrgWorkspaceId: (id: string | null) => void;
}

export const useOrgStore = create<OrgState>((set) => ({
  userOrgs: [],
  setUserOrgs: (orgs) => set({ userOrgs: orgs }),

  activeOrgMembers: [],
  setActiveOrgMembers: (members) => set({ activeOrgMembers: members }),
  activeOrgWorkspaces: [],
  setActiveOrgWorkspaces: (workspaces) => set({ activeOrgWorkspaces: workspaces }),
  activeOrgBoardRefs: [],
  setActiveOrgBoardRefs: (refs) => set({ activeOrgBoardRefs: refs }),

  activeOrgWorkspaceId: null,
  setActiveOrgWorkspaceId: (id) => set({ activeOrgWorkspaceId: id }),
}));

// --- Subscription lifecycle ---

let orgDiscoveryUnsub: Unsubscribe | null = null;
let orgDetailUnsubs: Unsubscribe[] = [];

/** Start discovering all orgs the user belongs to. */
export function startOrgDiscovery(userId: string): void {
  stopOrgDiscovery();
  orgDiscoveryUnsub = subscribeToUserOrgs(userId, (orgs) => {
    useOrgStore.getState().setUserOrgs(orgs);
  });
}

/** Stop org discovery subscription. */
export function stopOrgDiscovery(): void {
  orgDiscoveryUnsub?.();
  orgDiscoveryUnsub = null;
  useOrgStore.getState().setUserOrgs([]);
}

/** Start listeners for an active org's members, workspaces, and board refs. */
export function startOrgDetailListeners(orgId: string): void {
  stopOrgDetailListeners();

  const membersUnsub = subscribeToOrgMembers(orgId, (members) => {
    useOrgStore.getState().setActiveOrgMembers(members);
  });

  const workspacesUnsub = subscribeToOrgWorkspaces(orgId, (workspaces) => {
    useOrgStore.getState().setActiveOrgWorkspaces(workspaces);

    // Auto-select first workspace if none selected
    const currentWsId = useOrgStore.getState().activeOrgWorkspaceId;
    if (!currentWsId && workspaces.length > 0) {
      useOrgStore.getState().setActiveOrgWorkspaceId(workspaces[0].id);
    }
  });

  orgDetailUnsubs = [membersUnsub, workspacesUnsub];

  // Board refs subscription is handled separately when workspace changes
  // (see startOrgBoardRefsListener)
}

/** Stop active org detail listeners. */
export function stopOrgDetailListeners(): void {
  for (const unsub of orgDetailUnsubs) unsub();
  orgDetailUnsubs = [];
  stopOrgBoardRefsListener();

  const store = useOrgStore.getState();
  store.setActiveOrgMembers([]);
  store.setActiveOrgWorkspaces([]);
  store.setActiveOrgBoardRefs([]);
  store.setActiveOrgWorkspaceId(null);
}

let boardRefsUnsub: Unsubscribe | null = null;

/** Start listening to board refs for a specific org workspace. */
export function startOrgBoardRefsListener(orgId: string, workspaceId: string): void {
  stopOrgBoardRefsListener();
  boardRefsUnsub = subscribeToOrgBoardRefs(orgId, workspaceId, (refs) => {
    useOrgStore.getState().setActiveOrgBoardRefs(refs);
  });
}

/** Stop board refs listener. */
export function stopOrgBoardRefsListener(): void {
  boardRefsUnsub?.();
  boardRefsUnsub = null;
  useOrgStore.getState().setActiveOrgBoardRefs([]);
}
