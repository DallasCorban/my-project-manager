// projectSync — real-time Firestore sync for shared project state.
// Ported from App.jsx:3965-4082 (onSnapshot + debounced writes) and 3545-3590 (ensure/setup).

import {
  doc,
  setDoc,
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
  if (!canUseFirestore()) return;

  const handle = handles.get(projectId);

  // Serialize and check cache
  let payload: string;
  try {
    payload = JSON.stringify(project);
  } catch {
    return;
  }

  // Skip if unchanged from last write
  if (handle?.lastSerializedCache === payload) return;

  // Cancel pending write timer
  if (handle?.writeTimer) {
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

      // Update caches
      const h = handles.get(projectId);
      if (h) {
        h.lastWrittenPayload = payload;
        h.lastSerializedCache = payload;
      }
    } catch (err) {
      const shouldDisable = handleFirestoreListenerError(err, `projectSync-write:${projectId}`);
      if (!shouldDisable) {
        warnFirestoreOnce(
          `projectSync-write-${projectId}`,
          `Write failed for project ${projectId}: ${err}`,
        );
      }
    }
  }, PROJECT_SYNC_DEBOUNCE_MS);

  if (handle) {
    handle.writeTimer = timer;
    handle.lastSerializedCache = payload;
  }
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
    // Write project metadata
    const projectRef = doc(getDb(), 'projects', projectId);
    await setDoc(
      projectRef,
      {
        name: project.name,
        workspaceId: project.workspaceId || '',
        workspaceName: (project as Board & { workspaceName?: string }).workspaceName || '',
        createdAt: serverTimestamp(),
        createdBy: userId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    // Write admin membership for the creator
    const memberRef = doc(getDb(), 'projects', projectId, 'members', userId);
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
  } catch (err) {
    handleFirestoreListenerError(err, `ensureProject:${projectId}`);
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
