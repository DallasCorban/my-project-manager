// inviteSync — invite creation, acceptance, email queue, and URL auto-accept.
// Ported from App.jsx:3282-3390 (invite CRUD) and 3796-3937 (accept flow).

import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { canUseFirestore, getDb, handleFirestoreListenerError } from './firestore';
import { createShareToken } from '../../utils/id';
import type { Invite, Member } from '../../types/member';

// --- Invite CRUD ---

interface CreateInviteParams {
  projectId: string;
  email: string;
  role: string;
  baseRole?: string | null;
  accessUntil?: Date | null;
  inviterUid: string;
  inviterEmail: string;
}

/**
 * Create a project invite and queue an email notification.
 * Returns the invite document ID and share token.
 */
export async function createInvite(params: CreateInviteParams): Promise<{
  inviteId: string;
  token: string;
} | null> {
  if (!canUseFirestore()) return null;

  const token = createShareToken();
  const invitesRef = collection(getDb(), 'projects', params.projectId, 'invites');

  const inviteDoc = await addDoc(invitesRef, {
    projectId: params.projectId,
    email: params.email.toLowerCase(),
    role: params.role,
    baseRole: params.baseRole || null,
    accessUntil: params.accessUntil || null,
    status: 'pending',
    token,
    createdAt: serverTimestamp(),
    invitedBy: params.inviterUid,
    invitedByEmail: params.inviterEmail,
  });

  // Queue email notification
  try {
    const baseUrl = window.location.origin + window.location.pathname;
    const inviteUrl = `${baseUrl}?invite=${token}&pid=${params.projectId}&iid=${inviteDoc.id}`;

    await addDoc(collection(getDb(), 'mail'), {
      to: params.email.toLowerCase(),
      message: {
        subject: "You're invited to a board",
        text: `You've been invited to collaborate. Accept here: ${inviteUrl}`,
        html: `<p>You've been invited to collaborate.</p><p><a href="${inviteUrl}">Accept Invite</a></p>`,
      },
    });
  } catch {
    // Email queue failure is non-critical — invite still created
  }

  return { inviteId: inviteDoc.id, token };
}

/**
 * Accept an invite: create membership, update invite status.
 */
export async function acceptInvite(
  projectId: string,
  inviteId: string,
  invite: Invite,
  userId: string,
  userEmail: string,
): Promise<boolean> {
  if (!canUseFirestore()) return false;

  try {
    // Create member document
    const memberRef = doc(getDb(), 'projects', projectId, 'members', userId);
    await setDoc(memberRef, {
      uid: userId,
      email: userEmail.toLowerCase(),
      role: invite.role,
      baseRole: invite.baseRole || null,
      inviteId: invite.id,
      accessUntil: invite.accessUntil || null,
      status: 'active',
      joinedAt: serverTimestamp(),
      invitedBy: invite.invitedBy,
      invitedAt: invite.createdAt || null,
    } as Partial<Member>, { merge: true });

    // Update invite status
    const inviteRef = doc(getDb(), 'projects', projectId, 'invites', inviteId);
    await updateDoc(inviteRef, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      acceptedBy: userId,
    });

    return true;
  } catch (err) {
    handleFirestoreListenerError(err, `acceptInvite:${projectId}`);
    return false;
  }
}

/**
 * Revoke a pending invite.
 */
export async function revokeInvite(projectId: string, inviteId: string): Promise<void> {
  if (!canUseFirestore()) return;

  const inviteRef = doc(getDb(), 'projects', projectId, 'invites', inviteId);
  await updateDoc(inviteRef, {
    status: 'revoked',
    revokedAt: serverTimestamp(),
  });
}

/**
 * Remove a member from a project.
 */
export async function removeMember(projectId: string, uid: string): Promise<void> {
  if (!canUseFirestore()) return;

  await deleteDoc(doc(getDb(), 'projects', projectId, 'members', uid));
}

/**
 * Update a member's role in a project.
 */
export async function updateMemberRole(
  projectId: string,
  uid: string,
  updates: { role?: string; baseRole?: string | null; accessUntil?: Date | null },
): Promise<void> {
  if (!canUseFirestore()) return;

  const memberRef = doc(getDb(), 'projects', projectId, 'members', uid);
  await updateDoc(memberRef, updates);
}

// --- Real-time invite listener ---

/**
 * Subscribe to all invites for a project (admin only).
 */
export function subscribeToProjectInvites(
  projectId: string,
  onUpdate: (invites: Invite[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const invitesRef = collection(getDb(), 'projects', projectId, 'invites');

  return onSnapshot(
    invitesRef,
    (snapshot) => {
      const invites: Invite[] = snapshot.docs.map((d) => ({
        ...(d.data() as Invite),
        id: d.id,
      }));
      onUpdate(invites);
    },
    (err) => {
      handleFirestoreListenerError(err, `inviteSync:${projectId}`);
    },
  );
}

// --- URL auto-accept ---

/**
 * Check URL parameters for an invite token and attempt to auto-accept.
 * Returns true if an invite was successfully accepted.
 */
export async function tryAutoAcceptInvite(
  userId: string,
  userEmail: string,
): Promise<boolean> {
  if (!canUseFirestore()) return false;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  const pid = params.get('pid');
  const iid = params.get('iid');

  if (!token) return false;

  let accepted = false;

  // Strategy 1: Direct path lookup (pid + iid)
  if (pid && iid) {
    try {
      const inviteRef = doc(getDb(), 'projects', pid, 'invites', iid);
      const inviteSnap = await getDoc(inviteRef);

      if (inviteSnap.exists()) {
        const data = inviteSnap.data() as Invite;
        if (
          data.status === 'pending' &&
          data.email?.toLowerCase() === userEmail.toLowerCase() &&
          data.token === token
        ) {
          accepted = await acceptInvite(pid, iid, { ...data, id: iid }, userId, userEmail);
        }
      }
    } catch {
      // Fall through to collection group query
    }
  }

  // Strategy 2: Collection group fallback
  if (!accepted) {
    try {
      const invitesQuery = query(
        collectionGroup(getDb(), 'invites'),
        where('token', '==', token),
        where('email', '==', userEmail.toLowerCase()),
        where('status', '==', 'pending'),
      );
      const snapshot = await getDocs(invitesQuery);

      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data() as Invite;
        const projectId = docSnap.ref.parent.parent?.id;
        if (projectId) {
          accepted = await acceptInvite(
            projectId,
            docSnap.id,
            { ...data, id: docSnap.id },
            userId,
            userEmail,
          );
        }
      }
    } catch {
      // Auto-accept failed silently
    }
  }

  // Clean URL parameters
  if (token) {
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    url.searchParams.delete('pid');
    url.searchParams.delete('iid');
    window.history.replaceState({}, '', url.toString());
  }

  return accepted;
}
