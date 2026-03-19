// orgSync — Firestore CRUD for organisations, members, workspaces, and board refs.

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  collectionGroup,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { canUseFirestore, getDb, handleFirestoreListenerError } from './firestore';
import type { Organization, OrgMember } from '../../types/org';

// --- Org types used internally ---

export interface OrgWorkspace {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface OrgBoardRef {
  id: string;
  projectId: string;
  addedAt: unknown;
  addedBy: string;
}

// --- CRUD ---

/** Create a new organisation. Returns the generated org ID. */
export async function createOrg(
  name: string,
  userId: string,
  userEmail: string,
): Promise<string | null> {
  if (!canUseFirestore()) return null;

  const orgRef = doc(collection(getDb(), 'orgs'));
  const orgId = orgRef.id;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  try {
    await setDoc(orgRef, {
      name,
      slug,
      plan: 'free',
      createdBy: userId,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('createOrg: failed to create org doc', err);
    throw err;
  }

  try {
    // Creator becomes org owner
    const memberRef = doc(getDb(), 'orgs', orgId, 'members', userId);
    await setDoc(memberRef, {
      uid: userId,
      email: userEmail.toLowerCase(),
      orgRole: 'owner',
      joinedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('createOrg: failed to create member doc', err);
    throw err;
  }

  return orgId;
}

/** Create a shared workspace inside an org. Returns the workspace ID. */
export async function createOrgWorkspace(
  orgId: string,
  name: string,
  sortOrder = 0,
): Promise<string | null> {
  if (!canUseFirestore()) return null;

  try {
    const wsRef = doc(collection(getDb(), 'orgs', orgId, 'workspaces'));
    await setDoc(wsRef, {
      name,
      color: '#579bfc',
      sortOrder,
      createdAt: serverTimestamp(),
    });
    return wsRef.id;
  } catch (err) {
    handleFirestoreListenerError(err, `createOrgWorkspace:${orgId}`);
    return null;
  }
}

/** Add a board reference to an org workspace. */
export async function addBoardToOrgWorkspace(
  orgId: string,
  workspaceId: string,
  projectId: string,
  userId: string,
): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const refDoc = doc(
      collection(getDb(), 'orgs', orgId, 'workspaces', workspaceId, 'boardRefs'),
    );
    await setDoc(refDoc, {
      projectId,
      addedAt: serverTimestamp(),
      addedBy: userId,
    });
  } catch (err) {
    handleFirestoreListenerError(err, `addBoardRef:${orgId}/${workspaceId}`);
  }
}

/** Remove a board reference from an org workspace. */
export async function removeBoardFromOrgWorkspace(
  orgId: string,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const refsCol = collection(getDb(), 'orgs', orgId, 'workspaces', workspaceId, 'boardRefs');
    const snap = await getDocs(query(refsCol, where('projectId', '==', projectId)));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    handleFirestoreListenerError(err, `removeBoardRef:${orgId}/${workspaceId}/${projectId}`);
  }
}

/** Invite a user to an org by email. */
export async function inviteToOrg(
  orgId: string,
  email: string,
  orgRole: OrgMember['orgRole'],
  invitedBy: string,
): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const inviteRef = doc(collection(getDb(), 'orgs', orgId, 'invites'));
    await setDoc(inviteRef, {
      email: email.toLowerCase(),
      orgRole,
      status: 'pending',
      invitedBy,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreListenerError(err, `inviteToOrg:${orgId}`);
  }
}

/** Remove a member from an org. */
export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    await deleteDoc(doc(getDb(), 'orgs', orgId, 'members', userId));
  } catch (err) {
    handleFirestoreListenerError(err, `removeOrgMember:${orgId}/${userId}`);
  }
}

/** Rename an org. */
export async function updateOrgName(orgId: string, name: string): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    await updateDoc(doc(getDb(), 'orgs', orgId), { name, slug });
  } catch (err) {
    handleFirestoreListenerError(err, `updateOrgName:${orgId}`);
  }
}

/** Archive an org (soft-delete). */
export async function archiveOrg(orgId: string): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    await updateDoc(doc(getDb(), 'orgs', orgId), { archivedAt: serverTimestamp() });
  } catch (err) {
    handleFirestoreListenerError(err, `archiveOrg:${orgId}`);
  }
}

/** Restore an archived org. */
export async function restoreOrg(orgId: string): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    await updateDoc(doc(getDb(), 'orgs', orgId), { archivedAt: null });
  } catch (err) {
    handleFirestoreListenerError(err, `restoreOrg:${orgId}`);
  }
}

// --- Real-time subscriptions ---

/** Subscribe to all orgs the current user belongs to.
 *  Automatically retries if the collection-group index isn't ready yet. */
export function subscribeToUserOrgs(
  userId: string,
  onUpdate: (orgs: Organization[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  let cancelled = false;
  let cleanupCurrent: (() => void) | null = null;

  function startListener() {
    // Collection-group query: find all /orgs/*/members docs where uid == userId
    const q = query(
      collectionGroup(getDb(), 'members'),
      where('uid', '==', userId),
    );

    // Track org IDs to subscribe to their metadata
    const orgUnsubs = new Map<string, Unsubscribe>();
    const orgCache = new Map<string, Organization>();

    const memberUnsub = onSnapshot(
      q,
      (snapshot) => {
        const orgIds = new Set<string>();

        for (const docSnap of snapshot.docs) {
          // Only include docs from /orgs/*/members (not /projects/*/members)
          const pathParts = docSnap.ref.path.split('/');
          if (pathParts[0] !== 'orgs') continue;
          const orgId = pathParts[1];
          orgIds.add(orgId);
        }

        // Subscribe to any new orgs
        for (const orgId of orgIds) {
          if (orgUnsubs.has(orgId)) continue;

          const orgRef = doc(getDb(), 'orgs', orgId);
          const unsub = onSnapshot(
            orgRef,
            (orgSnap) => {
              if (!orgSnap.exists()) {
                orgCache.delete(orgId);
              } else {
                const data = orgSnap.data();
                orgCache.set(orgId, {
                  id: orgId,
                  name: data.name || '',
                  slug: data.slug || '',
                  avatarUrl: data.avatarUrl,
                  plan: data.plan || 'free',
                  createdBy: data.createdBy || '',
                  createdAt: data.createdAt,
                  archivedAt: data.archivedAt || null,
                  settings: data.settings,
                });
              }
              onUpdate(Array.from(orgCache.values()));
            },
            (err) => handleFirestoreListenerError(err, `orgMeta:${orgId}`),
          );
          orgUnsubs.set(orgId, unsub);
        }

        // Unsubscribe from removed orgs
        for (const [orgId, unsub] of orgUnsubs) {
          if (!orgIds.has(orgId)) {
            unsub();
            orgUnsubs.delete(orgId);
            orgCache.delete(orgId);
          }
        }

        onUpdate(Array.from(orgCache.values()));
      },
      (err) => {
        const msg = String((err as Error).message || '');
        // Retry if the index isn't built yet (transient infra issue)
        if (msg.includes('index') && !cancelled) {
          console.warn('subscribeToUserOrgs: index not ready, retrying in 5s...');
          cleanup();
          setTimeout(() => { if (!cancelled) startListener(); }, 5000);
          return;
        }
        handleFirestoreListenerError(err, 'subscribeToUserOrgs');
      },
    );

    function cleanup() {
      memberUnsub();
      for (const unsub of orgUnsubs.values()) unsub();
      orgUnsubs.clear();
      orgCache.clear();
    }

    cleanupCurrent = cleanup;
  }

  startListener();

  return () => {
    cancelled = true;
    cleanupCurrent?.();
  };
}

/** Subscribe to all members of an org. */
export function subscribeToOrgMembers(
  orgId: string,
  onUpdate: (members: OrgMember[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const membersRef = collection(getDb(), 'orgs', orgId, 'members');
  return onSnapshot(
    membersRef,
    (snapshot) => {
      const members: OrgMember[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          uid: data.uid || d.id,
          email: data.email || '',
          orgRole: data.orgRole || 'member',
          joinedAt: data.joinedAt,
          invitedBy: data.invitedBy,
        };
      });
      onUpdate(members);
    },
    (err) => handleFirestoreListenerError(err, `orgMembers:${orgId}`),
  );
}

/** Subscribe to shared workspaces within an org. */
export function subscribeToOrgWorkspaces(
  orgId: string,
  onUpdate: (workspaces: OrgWorkspace[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const wsRef = collection(getDb(), 'orgs', orgId, 'workspaces');
  return onSnapshot(
    wsRef,
    (snapshot) => {
      const workspaces: OrgWorkspace[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || '',
          color: data.color || '#579bfc',
          sortOrder: data.sortOrder ?? 0,
        };
      });
      workspaces.sort((a, b) => a.sortOrder - b.sortOrder);
      onUpdate(workspaces);
    },
    (err) => handleFirestoreListenerError(err, `orgWorkspaces:${orgId}`),
  );
}

/** Subscribe to board refs within an org workspace. */
export function subscribeToOrgBoardRefs(
  orgId: string,
  workspaceId: string,
  onUpdate: (refs: OrgBoardRef[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const refsRef = collection(
    getDb(),
    'orgs',
    orgId,
    'workspaces',
    workspaceId,
    'boardRefs',
  );
  return onSnapshot(
    refsRef,
    (snapshot) => {
      const refs: OrgBoardRef[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          projectId: data.projectId || '',
          addedAt: data.addedAt,
          addedBy: data.addedBy || '',
        };
      });
      onUpdate(refs);
    },
    (err) => handleFirestoreListenerError(err, `orgBoardRefs:${orgId}/${workspaceId}`),
  );
}
