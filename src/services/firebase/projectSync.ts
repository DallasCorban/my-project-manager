// projectSync — real-time Firestore sync for shared project state.
// Ported from App.jsx:3965-4082 (onSnapshot + debounced writes) and 3545-3590 (ensure/setup).

import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { canUseFirestore, getDb, handleFirestoreListenerError, warnFirestoreOnce } from './firestore';
import { PROJECT_SYNC_DEBOUNCE_MS, PROJECT_STATE_DOC_ID } from '../../config/constants';
import type { Board } from '../../types/board';

// --- Types ---

interface ProjectStateDoc {
  value: string;
  updatedAt: unknown;
  updatedBy: string;
}

interface SyncHandle {
  unsubscribe: Unsubscribe;
  writeTimer: ReturnType<typeof setTimeout> | null;
  lastWrittenPayload: string | null;
  lastSerializedCache: string | null;
}

// --- State caches ---
const handles = new Map<string, SyncHandle>();

/**
 * Subscribe to real-time state updates for a project.
 * Returns an unsubscribe function.
 */
export function subscribeToProjectState(
  projectId: string,
  onUpdate: (project: Board) => void,
  onError?: (projectId: string, err: unknown) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const stateRef = doc(getDb(), 'projects', projectId, 'state', PROJECT_STATE_DOC_ID);

  const unsub = onSnapshot(
    stateRef,
    (snapshot) => {
      if (!snapshot.exists()) return;

      const data = snapshot.data() as ProjectStateDoc;
      if (!data?.value) return;

      try {
        const parsed = JSON.parse(data.value) as Board;
        // Check cache to avoid redundant updates
        const handle = handles.get(projectId);
        if (handle && handle.lastWrittenPayload === data.value) return;

        if (handle) {
          handle.lastWrittenPayload = data.value;
          // Also update serialized cache so pending debounced writes
          // don't overwrite remote changes (e.g. AI-created tasks)
          handle.lastSerializedCache = data.value;
          // Cancel any pending local write to avoid overwriting remote change
          if (handle.writeTimer) {
            clearTimeout(handle.writeTimer);
            handle.writeTimer = null;
          }
        }

        onUpdate(parsed);
      } catch (err) {
        warnFirestoreOnce(`projectSync-parse-${projectId}`, `Failed to parse project state: ${err}`);
      }
    },
    (err) => {
      const shouldUnsub = handleFirestoreListenerError(err, `projectSync:${projectId}`);
      if (shouldUnsub) {
        cleanup(projectId);
      }
      onError?.(projectId, err);
    },
  );

  const handle: SyncHandle = {
    unsubscribe: unsub,
    writeTimer: null,
    lastWrittenPayload: null,
    lastSerializedCache: null,
  };
  handles.set(projectId, handle);

  return () => cleanup(projectId);
}

/**
 * Write project state to Firestore with debouncing.
 * Only writes if the serialized payload has actually changed.
 */
export function writeProjectState(
  projectId: string,
  project: Board,
  userId: string,
): void {
  if (!canUseFirestore()) {
    console.warn(`[projectSync] canUseFirestore() returned false, skipping write for ${projectId}`);
    return;
  }

  // Ensure a write-only handle exists even without a subscription
  let handle = handles.get(projectId);
  if (!handle) {
    handle = {
      unsubscribe: () => {},
      writeTimer: null,
      lastWrittenPayload: null,
      lastSerializedCache: null,
    };
    handles.set(projectId, handle);
  }

  // Serialize and check cache
  let payload: string;
  try {
    payload = JSON.stringify(project);
  } catch {
    return;
  }

  // Skip if unchanged from last write
  if (handle.lastSerializedCache === payload) return;

  // Cancel pending write timer
  if (handle.writeTimer) {
    clearTimeout(handle.writeTimer);
  }

  const timer = setTimeout(async () => {
    if (!canUseFirestore()) return;

    const stateRef = doc(getDb(), 'projects', projectId, 'state', PROJECT_STATE_DOC_ID);

    try {
      await setDoc(
        stateRef,
        {
          value: payload,
          updatedAt: serverTimestamp(),
          updatedBy: userId,
        },
        { merge: true },
      );
      console.log(`[projectSync] writeProjectState succeeded for ${projectId}`);

      // Update caches
      const h = handles.get(projectId);
      if (h) {
        h.lastWrittenPayload = payload;
        h.lastSerializedCache = payload;
      }
    } catch (err) {
      console.error(`[projectSync] writeProjectState FAILED for ${projectId}:`, err);
      const shouldDisable = handleFirestoreListenerError(err, `projectSync-write:${projectId}`);
      if (!shouldDisable) {
        warnFirestoreOnce(
          `projectSync-write-${projectId}`,
          `Write failed for project ${projectId}: ${err}`,
        );
      }
    }
  }, PROJECT_SYNC_DEBOUNCE_MS);

  handle.writeTimer = timer;
  handle.lastSerializedCache = payload;
}

/**
 * Ensure project metadata and admin membership exist in Firestore.
 * Called when a project is first created or becomes visible.
 */
export async function ensureProjectSetup(
  projectId: string,
  project: Board,
  userId: string,
  userEmail: string,
): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const db = getDb();

    // Write project metadata
    const projectRef = doc(db, 'projects', projectId);
    await setDoc(
      projectRef,
      {
        name: project.name,
        workspaceId: project.workspaceId || '',
        workspaceName: (project as Board & { workspaceName?: string }).workspaceName || '',
        ownerType: project.ownerType || 'personal',
        ownerRef: project.ownerRef || userId,
        createdAt: serverTimestamp(),
        createdBy: userId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Write admin membership for the creator
    const memberRef = doc(db, 'projects', projectId, 'members', userId);
    await setDoc(
      memberRef,
      {
        uid: userId,
        email: userEmail.toLowerCase(),
        role: 'owner',
        status: 'active',
        joinedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Write initial state/main doc so the board is backed up immediately
    const stateRef = doc(db, 'projects', projectId, 'state', PROJECT_STATE_DOC_ID);
    const payload = JSON.stringify(project);
    try {
      await setDoc(
        stateRef,
        {
          value: payload,
          updatedAt: serverTimestamp(),
          updatedBy: userId,
        },
        { merge: true },
      );
      console.log(`[projectSync] state/main written for ${projectId}`);
    } catch (stateErr) {
      console.error(`[projectSync] FAILED to write state/main for ${projectId}:`, stateErr);
    }

    // Seed the cache so writeProjectState doesn't re-write the same data
    const handle = handles.get(projectId);
    if (handle) {
      handle.lastWrittenPayload = payload;
      handle.lastSerializedCache = payload;
    }
  } catch (err) {
    console.error(`[projectSync] ensureProjectSetup failed for ${projectId}:`, err);
    handleFirestoreListenerError(err, `ensureProject:${projectId}`);
  }
}

/**
 * Update project metadata doc when name or workspace changes.
 * Called separately from ensureProjectSetup (which is one-time).
 */
export async function updateProjectMetadata(
  projectId: string,
  fields: { name?: string; workspaceName?: string },
  userId: string,
): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const projectRef = doc(getDb(), 'projects', projectId);
    await setDoc(
      projectRef,
      {
        ...fields,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreListenerError(err, `updateProjectMeta:${projectId}`);
  }
}

/**
 * Clean up a project sync subscription and pending writes.
 */
function cleanup(projectId: string): void {
  const handle = handles.get(projectId);
  if (!handle) return;

  handle.unsubscribe();
  if (handle.writeTimer) {
    clearTimeout(handle.writeTimer);
  }
  handles.delete(projectId);
}

/**
 * Clean up all project sync subscriptions.
 */
export function cleanupAllProjectSync(): void {
  for (const [pid] of handles) {
    cleanup(pid);
  }
}

/**
 * Permanently delete a project and its subcollections from Firestore.
 */
export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
  if (!canUseFirestore()) return;

  // Stop any active sync for this project
  cleanup(projectId);

  try {
    const db = getDb();
    const projectRef = doc(db, 'projects', projectId);

    // Delete known subcollection docs (state, members, invites)
    for (const sub of ['state', 'members', 'invites']) {
      const snap = await getDocs(collection(projectRef, sub));
      for (const d of snap.docs) {
        await deleteDoc(d.ref);
      }
    }

    // Delete the project document itself
    await deleteDoc(projectRef);
  } catch (err) {
    handleFirestoreListenerError(err, `deleteProject:${projectId}`);
  }
}
