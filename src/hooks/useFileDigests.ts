// useFileDigests — manages opt-in file content extraction for AI context.
// Each file can be toggled to "digest" — extracting text content (PDF, audio, etc.)
// and making it available to the AI in the item context.
//
// Uses individual getDoc calls per file instead of getDocs on the collection,
// because getDocs can hang when Firestore's offline cache hasn't seen the collection.

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuthStore } from '../stores/authStore';
import { requestFileDigest } from '../services/ai/fileDigestService';
import type { ProjectFile } from '../types/file';

export interface FileDigest {
  fileId: string;
  enabled: boolean;
  status: 'pending' | 'processing' | 'done' | 'error';
  extractedText?: string;
  speakerLabels?: Record<string, string>;
  error?: string;
  extractedAt?: string;
}

export interface UseFileDigestsReturn {
  digests: Record<string, FileDigest>;
  toggleDigest: (file: ProjectFile) => Promise<void>;
  updateSpeakerLabel: (fileId: string, speakerKey: string, newName: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useFileDigests(
  projectId: string | null,
  fileIds?: string[],
): UseFileDigestsReturn {
  const user = useAuthStore((s) => s.user);
  const [digests, setDigests] = useState<Record<string, FileDigest>>({});
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Fetch digest docs for known file IDs (individual getDoc calls)
  const fetchDigests = useCallback(async () => {
    if (!projectId || !db || !fileIds || fileIds.length === 0) {
      setDigests({});
      return;
    }
    const firestore = db;
    try {
      const results = await Promise.all(
        fileIds.map(async (fid) => {
          const snap = await getDoc(doc(firestore, 'projects', projectId, 'fileDigests', fid));
          if (snap.exists()) {
            return snap.data() as FileDigest;
          }
          return null;
        }),
      );
      if (!mountedRef.current) return;
      const updated: Record<string, FileDigest> = {};
      for (const data of results) {
        if (data) updated[data.fileId] = data;
      }
      setDigests(updated);
    } catch (err) {
      console.error('[useFileDigests] Failed to fetch:', err);
    }
  }, [projectId, fileIds?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true; // Reset on re-mount (React strict mode)
    void fetchDigests();
  }, [fetchDigests]);

  // Poll for processing digests to check if they've completed
  useEffect(() => {
    const hasProcessing = Object.values(digests).some(
      (d) => d.status === 'pending' || d.status === 'processing',
    );
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      void fetchDigests();
    }, 5_000);

    return () => clearInterval(interval);
  }, [digests, fetchDigests]);

  const toggleDigest = useCallback(async (file: ProjectFile) => {
    if (!projectId || !db || !user) return;

    const existing = digests[file.id];
    const newEnabled = !existing?.enabled;

    const ref = doc(db, 'projects', projectId, 'fileDigests', file.id);

    if (newEnabled) {
      // Check if already done (e.g., re-enabling a previously completed digest)
      if (existing?.status === 'done') {
        setDigests((prev) => ({
          ...prev,
          [file.id]: { ...existing, enabled: true },
        }));
        await setDoc(ref, { enabled: true }, { merge: true });
        return;
      }

      // Optimistically update local state
      setDigests((prev) => ({
        ...prev,
        [file.id]: { fileId: file.id, enabled: true, status: 'pending' },
      }));

      // Write to Firestore (merge to avoid overwriting existing data)
      await setDoc(ref, {
        fileId: file.id,
        enabled: true,
        status: 'pending',
      }, { merge: true });

      // Trigger backend extraction
      try {
        await requestFileDigest(
          file.id,
          projectId,
          file.storagePath || '',
          file.type || '',
        );
        // Backend succeeded — re-fetch to get the completed result
        await fetchDigests();
      } catch (err) {
        console.error('File digest request failed:', err);
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setDigests((prev) => ({
          ...prev,
          [file.id]: { fileId: file.id, enabled: true, status: 'error', error: errorMsg },
        }));
        await updateDoc(ref, { status: 'error', error: errorMsg }).catch(() => {});
      }
    } else {
      // Disable
      setDigests((prev) => ({
        ...prev,
        [file.id]: { fileId: file.id, enabled: false, status: 'pending' },
      }));
      await setDoc(ref, {
        fileId: file.id,
        enabled: false,
        status: 'pending',
      });
    }
  }, [projectId, user, digests, fetchDigests]);

  const updateSpeakerLabel = useCallback(async (
    fileId: string,
    speakerKey: string,
    newName: string,
  ) => {
    if (!projectId || !db) return;

    const existing = digests[fileId];
    if (!existing) return;

    const labels = { ...(existing.speakerLabels || {}), [speakerKey]: newName };

    setDigests((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], speakerLabels: labels },
    }));

    const ref = doc(db, 'projects', projectId, 'fileDigests', fileId);
    await updateDoc(ref, { speakerLabels: labels });
  }, [projectId, digests]);

  return { digests, toggleDigest, updateSpeakerLabel, refresh: fetchDigests };
}
