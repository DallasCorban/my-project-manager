// memberSync — membership discovery and self-membership listeners.
// Ported from App.jsx:3620-3741 (membership listeners + collection group queries).

import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { canUseFirestore, getDb, handleFirestoreListenerError, warnFirestoreOnce } from './firestore';
import type { Member } from '../../types/member';

// --- Types ---

export interface MembershipInfo {
  projectId: string;
  projectName: string;
  role: string;
  status: string;
  member: Member;
}

// --- Self-membership listener ---

/**
 * Subscribe to the current user's membership document for a specific project.
 * Returns an unsubscribe function.
 */
export function subscribeToSelfMembership(
  projectId: string,
  userId: string,
  onUpdate: (member: Member | null) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const memberRef = doc(getDb(), 'projects', projectId, 'members', userId);

  return onSnapshot(
    memberRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Member;
        onUpdate({ ...data, id: snapshot.id });
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      const shouldUnsub = handleFirestoreListenerError(err, `selfMembership:${projectId}`);
      if (shouldUnsub) {
        onUpdate(null);
      }
    },
  );
}

/**
 * Subscribe to all members of a specific project.
 * Returns an unsubscribe function.
 */
export function subscribeToProjectMembers(
  projectId: string,
  onUpdate: (members: Member[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const membersRef = collection(getDb(), 'projects', projectId, 'members');

  return onSnapshot(
    membersRef,
    (snapshot) => {
      const members: Member[] = snapshot.docs.map((d) => ({
        ...(d.data() as Member),
        id: d.id,
      }));
      onUpdate(members);
    },
    (err) => {
      const shouldUnsub = handleFirestoreListenerError(err, `projectMembers:${projectId}`);
      if (shouldUnsub) {
        warnFirestoreOnce(`memberSync-${projectId}`, `Members listener failed for ${projectId}`);
      }
    },
  );
}

// --- Membership discovery ---

/**
 * Discover all projects where the user is a member via collection group query.
 * Returns an unsubscribe function.
 */
export function discoverMemberProjects(
  userId: string,
  onUpdate: (projects: MembershipInfo[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const membersGroup = collectionGroup(getDb(), 'members');
  const q = query(membersGroup, where('uid', '==', userId));

  return onSnapshot(
    q,
    async (snapshot) => {
      const results: MembershipInfo[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Member;
        const projectId = docSnap.ref.parent.parent?.id;
        if (!projectId) continue;

        // Fetch project metadata to get name
        let projectName = '';
        try {
          const projectDoc = await getDoc(doc(getDb(), 'projects', projectId));
          if (projectDoc.exists()) {
            projectName = (projectDoc.data() as { name?: string }).name || '';
          }
        } catch {
          // Project metadata might not be accessible
        }

        results.push({
          projectId,
          projectName,
          role: data.role || 'viewer',
          status: data.status || 'active',
          member: { ...data, id: docSnap.id },
        });
      }

      onUpdate(results);
    },
    (err) => {
      handleFirestoreListenerError(err, 'discoverMemberProjects');
    },
  );
}

/**
 * Discover all projects owned/created by the user.
 * Returns an unsubscribe function.
 */
export function discoverOwnedProjects(
  userId: string,
  onUpdate: (projects: MembershipInfo[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const projectsRef = collection(getDb(), 'projects');
  const q = query(projectsRef, where('createdBy', '==', userId));

  return onSnapshot(
    q,
    (snapshot) => {
      const results: MembershipInfo[] = snapshot.docs.map((d) => {
        const data = d.data() as { name?: string };
        return {
          projectId: d.id,
          projectName: data.name || '',
          role: 'owner',
          status: 'active',
          member: {
            uid: userId,
            email: '',
            role: 'owner' as const,
            status: 'active' as const,
          },
        };
      });
      onUpdate(results);
    },
    (err) => {
      handleFirestoreListenerError(err, 'discoverOwnedProjects');
    },
  );
}
