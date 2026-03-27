// useAiMemory — manages persistent AI memory across three scopes:
// project, workspace, and user. Persists independently of chat history.

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthStore } from '../stores/authStore';

export interface MemoryFact {
  id: string;
  content: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryFactsDoc {
  facts: MemoryFact[];
  updatedAt: string;
  archivedAt?: string;
}

interface ProjectBriefDoc {
  content: string;
  updatedAt: string;
  updatedBy: string;
}

interface UserPreferencesDoc {
  factCategories: string[];
  workingStyle?: string;
  updatedAt: string;
}

export interface AiMemoryState {
  // Data
  projectFacts: MemoryFact[];
  workspaceFacts: MemoryFact[];
  userFacts: MemoryFact[];
  projectBrief: string | null;
  userPreferences: { factCategories: string[]; workingStyle: string | null } | null;

  // Actions
  deleteFact: (factId: string, scope: 'project' | 'workspace' | 'user') => Promise<void>;
  updateBrief: (content: string) => Promise<void>;
  updateCategories: (categories: string[]) => Promise<void>;
}

export function useAiMemory(
  projectId: string | null,
  workspaceId: string | null
): AiMemoryState {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;

  const [projectFacts, setProjectFacts] = useState<MemoryFact[]>([]);
  const [workspaceFacts, setWorkspaceFacts] = useState<MemoryFact[]>([]);
  const [userFacts, setUserFacts] = useState<MemoryFact[]>([]);
  const [projectBrief, setProjectBrief] = useState<string | null>(null);
  const [userPreferences, setUserPreferences] = useState<{
    factCategories: string[];
    workingStyle: string | null;
  } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Subscribe to project facts
  useEffect(() => {
    if (!projectId || !db) return;
    const ref = doc(db, 'projects', projectId, 'aiMemory', 'facts');
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setProjectFacts([]); return; }
      const data = snap.data() as MemoryFactsDoc;
      if (data.archivedAt) { setProjectFacts([]); return; }
      setProjectFacts(data.facts || []);
    }, () => setProjectFacts([]));
  }, [projectId]);

  // Subscribe to project brief
  useEffect(() => {
    if (!projectId || !db) return;
    const ref = doc(db, 'projects', projectId, 'aiMemory', 'brief');
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setProjectBrief(null); return; }
      const data = snap.data() as ProjectBriefDoc;
      setProjectBrief(data.content || null);
    }, () => setProjectBrief(null));
  }, [projectId]);

  // Subscribe to workspace facts
  // Note: workspace memory is stored at workspaceMemory/{workspaceId} for Cloud Functions access
  // But Firestore rules put it under orgs/{orgId}/workspaces/{wsId}/aiMemory/{memoryId}
  // For client reads, we try the workspace path within the org structure.
  // However, since the Cloud Functions use workspaceMemory/{id}, we'll read from there too
  // and rely on open reads for authenticated users.
  useEffect(() => {
    if (!workspaceId || !db) return;
    // Read from the same path the Cloud Functions write to
    const ref = doc(db, 'workspaceMemory', workspaceId);
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setWorkspaceFacts([]); return; }
      const data = snap.data() as MemoryFactsDoc;
      setWorkspaceFacts(data.facts || []);
    }, () => setWorkspaceFacts([]));
  }, [workspaceId]);

  // Subscribe to user facts
  useEffect(() => {
    if (!uid || !db) return;
    const ref = doc(db, 'users', uid, 'aiMemory', 'facts');
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setUserFacts([]); return; }
      const data = snap.data() as MemoryFactsDoc;
      setUserFacts(data.facts || []);
    }, () => setUserFacts([]));
  }, [uid]);

  // Subscribe to user preferences
  useEffect(() => {
    if (!uid || !db) return;
    const ref = doc(db, 'users', uid, 'aiMemory', 'preferences');
    return onSnapshot(ref, (snap) => {
      if (!mountedRef.current) return;
      if (!snap.exists()) { setUserPreferences(null); return; }
      const data = snap.data() as UserPreferencesDoc;
      setUserPreferences({
        factCategories: data.factCategories || [],
        workingStyle: data.workingStyle || null,
      });
    }, () => setUserPreferences(null));
  }, [uid]);

  const deleteFact = useCallback(
    async (factId: string, scope: 'project' | 'workspace' | 'user') => {
      if (!db) return;
      let ref;
      switch (scope) {
        case 'project':
          if (!projectId) return;
          ref = doc(db, 'projects', projectId, 'aiMemory', 'facts');
          break;
        case 'workspace':
          if (!workspaceId) return;
          ref = doc(db, 'workspaceMemory', workspaceId);
          break;
        case 'user':
          if (!uid) return;
          ref = doc(db, 'users', uid, 'aiMemory', 'facts');
          break;
      }

      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data() as MemoryFactsDoc;
      const facts = (data.facts || []).filter((f) => f.id !== factId);
      await updateDoc(ref, { facts, updatedAt: new Date().toISOString() });
    },
    [projectId, workspaceId, uid]
  );

  const updateBrief = useCallback(
    async (content: string) => {
      if (!projectId || !db || !uid) return;
      const ref = doc(db, 'projects', projectId, 'aiMemory', 'brief');
      await setDoc(ref, {
        content,
        updatedAt: new Date().toISOString(),
        updatedBy: uid,
      });
    },
    [projectId, uid]
  );

  const updateCategories = useCallback(
    async (categories: string[]) => {
      if (!uid || !db) return;
      const ref = doc(db, 'users', uid, 'aiMemory', 'preferences');
      await setDoc(ref, {
        factCategories: categories,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    },
    [uid]
  );

  return {
    projectFacts,
    workspaceFacts,
    userFacts,
    projectBrief,
    userPreferences,
    deleteFact,
    updateBrief,
    updateCategories,
  };
}
