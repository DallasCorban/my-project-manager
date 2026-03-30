// useAiBriefs — manages auto-generated briefs at all hierarchy levels.
// Replaces the old useAiMemory (facts-based) system with simple briefs.
//
// Uses one-time fetches instead of onSnapshot listeners to avoid
// Firestore INTERNAL ASSERTION errors from rapid listener setup/teardown.
//
// Scopes:
//   - Item brief: per task/deliverable/project item
//   - Team brief: workspace-wide knowledge
//   - User brief: personal preferences

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthStore } from '../stores/authStore';

interface BriefDoc {
  content: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AiBriefsState {
  // Brief content
  itemBrief: string | null;
  projectBrief: string | null;
  teamBrief: string | null;
  userBrief: string | null;

  // Actions (for manual editing via BriefViewer)
  updateItemBrief: (content: string) => Promise<void>;
  updateProjectBrief: (content: string) => Promise<void>;
  updateTeamBrief: (content: string) => Promise<void>;
  updateUserBrief: (content: string) => Promise<void>;

  /** Re-fetch all briefs from Firestore */
  refresh: () => Promise<void>;
}

/**
 * Build the composite ID for item-level briefs.
 * Format: taskId or taskId__subitemId or taskId__subitemId__subSubitemId
 */
function buildCompositeId(
  taskId: string,
  subitemId: string | null,
  subSubitemId: string | null,
): string {
  if (subSubitemId && subitemId) return `${taskId}__${subitemId}__${subSubitemId}`;
  if (subitemId) return `${taskId}__${subitemId}`;
  return taskId;
}

export function useAiBriefs(
  projectId: string | null,
  workspaceId: string | null,
  taskId?: string | null,
  subitemId?: string | null,
  subSubitemId?: string | null,
): AiBriefsState {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;

  const [itemBrief, setItemBrief] = useState<string | null>(null);
  const [projectBrief, setProjectBrief] = useState<string | null>(null);
  const [teamBrief, setTeamBrief] = useState<string | null>(null);
  const [userBrief, setUserBrief] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const compositeId = taskId ? buildCompositeId(taskId, subitemId ?? null, subSubitemId ?? null) : null;

  // Fetch all briefs
  const fetchBriefs = useCallback(async () => {
    if (!db) return;

    const promises: Promise<void>[] = [];

    // Item brief
    if (projectId && compositeId) {
      promises.push(
        getDoc(doc(db, 'projects', projectId, 'itemBriefs', compositeId))
          .then((snap) => {
            if (!mountedRef.current) return;
            setItemBrief(snap.exists() ? (snap.data() as BriefDoc).content || null : null);
          })
          .catch(() => { if (mountedRef.current) setItemBrief(null); }),
      );
    } else {
      setItemBrief(null);
    }

    // Project brief
    if (projectId) {
      promises.push(
        getDoc(doc(db, 'projects', projectId, 'aiMemory', 'brief'))
          .then((snap) => {
            if (!mountedRef.current) return;
            setProjectBrief(snap.exists() ? (snap.data() as BriefDoc).content || null : null);
          })
          .catch(() => { if (mountedRef.current) setProjectBrief(null); }),
      );
    } else {
      setProjectBrief(null);
    }

    // Team brief
    if (workspaceId) {
      promises.push(
        getDoc(doc(db, 'workspaceMemory', workspaceId))
          .then((snap) => {
            if (!mountedRef.current) return;
            const data = snap.data();
            setTeamBrief(snap.exists() ? (data?.content as string) || null : null);
          })
          .catch(() => { if (mountedRef.current) setTeamBrief(null); }),
      );
    } else {
      setTeamBrief(null);
    }

    // User brief
    if (uid) {
      promises.push(
        getDoc(doc(db, 'users', uid, 'aiMemory', 'brief'))
          .then((snap) => {
            if (!mountedRef.current) return;
            setUserBrief(snap.exists() ? (snap.data() as BriefDoc).content || null : null);
          })
          .catch(() => { if (mountedRef.current) setUserBrief(null); }),
      );
    } else {
      setUserBrief(null);
    }

    await Promise.all(promises);
  }, [projectId, compositeId, workspaceId, uid]);

  // Fetch on mount and when deps change
  useEffect(() => {
    void fetchBriefs();
  }, [fetchBriefs]);

  // Update actions — update local state immediately, then persist to Firestore
  const updateItemBrief = useCallback(async (content: string) => {
    if (!projectId || !compositeId || !db || !uid) return;
    setItemBrief(content);
    const ref = doc(db, 'projects', projectId, 'itemBriefs', compositeId);
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid });
  }, [projectId, compositeId, uid]);

  const updateProjectBrief = useCallback(async (content: string) => {
    if (!projectId || !db || !uid) return;
    setProjectBrief(content);
    const ref = doc(db, 'projects', projectId, 'aiMemory', 'brief');
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid });
  }, [projectId, uid]);

  const updateTeamBrief = useCallback(async (content: string) => {
    if (!workspaceId || !db || !uid) return;
    setTeamBrief(content);
    const ref = doc(db, 'workspaceMemory', workspaceId);
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid }, { merge: true });
  }, [workspaceId, uid]);

  const updateUserBrief = useCallback(async (content: string) => {
    if (!uid || !db) return;
    setUserBrief(content);
    const ref = doc(db, 'users', uid, 'aiMemory', 'brief');
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid });
  }, [uid]);

  return {
    itemBrief,
    projectBrief,
    teamBrief,
    userBrief,
    updateItemBrief,
    updateProjectBrief,
    updateTeamBrief,
    updateUserBrief,
    refresh: fetchBriefs,
  };
}
