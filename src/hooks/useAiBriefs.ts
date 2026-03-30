// useAiBriefs — manages auto-generated briefs at all hierarchy levels.
// Replaces the old useAiMemory (facts-based) system with simple briefs.
//
// Scopes:
//   - Item brief: per task/deliverable/project item
//   - Team brief: workspace-wide knowledge
//   - User brief: personal preferences
//
// Briefs are auto-updated by the AI after conversations and are also
// user-facing (shown in the Brief tab for quick project catch-up).

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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

  // Subscribe to item brief
  useEffect(() => {
    if (!projectId || !compositeId || !db) {
      setItemBrief(null);
      return;
    }
    const ref = doc(db, 'projects', projectId, 'itemBriefs', compositeId);
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setItemBrief(null); return; }
      const data = snap.data() as BriefDoc;
      setItemBrief(data.content || null);
    }, () => setItemBrief(null));
  }, [projectId, compositeId]);

  // Subscribe to project brief (top-level project item brief)
  useEffect(() => {
    if (!projectId || !db) {
      setProjectBrief(null);
      return;
    }
    const ref = doc(db, 'projects', projectId, 'aiMemory', 'brief');
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setProjectBrief(null); return; }
      const data = snap.data() as BriefDoc;
      setProjectBrief(data.content || null);
    }, () => setProjectBrief(null));
  }, [projectId]);

  // Subscribe to team brief
  useEffect(() => {
    if (!workspaceId || !db) {
      setTeamBrief(null);
      return;
    }
    const ref = doc(db, 'workspaceMemory', workspaceId);
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setTeamBrief(null); return; }
      const data = snap.data();
      // Support both old format (facts array) and new format (content string)
      setTeamBrief(data?.content || null);
    }, () => setTeamBrief(null));
  }, [workspaceId]);

  // Subscribe to user brief
  useEffect(() => {
    if (!uid || !db) {
      setUserBrief(null);
      return;
    }
    const ref = doc(db, 'users', uid, 'aiMemory', 'brief');
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setUserBrief(null); return; }
      const data = snap.data() as BriefDoc;
      setUserBrief(data.content || null);
    }, () => setUserBrief(null));
  }, [uid]);

  // Update actions
  const updateItemBrief = useCallback(async (content: string) => {
    if (!projectId || !compositeId || !db || !uid) return;
    const ref = doc(db, 'projects', projectId, 'itemBriefs', compositeId);
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid });
  }, [projectId, compositeId, uid]);

  const updateProjectBrief = useCallback(async (content: string) => {
    if (!projectId || !db || !uid) return;
    const ref = doc(db, 'projects', projectId, 'aiMemory', 'brief');
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid });
  }, [projectId, uid]);

  const updateTeamBrief = useCallback(async (content: string) => {
    if (!workspaceId || !db || !uid) return;
    const ref = doc(db, 'workspaceMemory', workspaceId);
    await setDoc(ref, { content, updatedAt: new Date().toISOString(), updatedBy: uid }, { merge: true });
  }, [workspaceId, uid]);

  const updateUserBrief = useCallback(async (content: string) => {
    if (!uid || !db) return;
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
  };
}
