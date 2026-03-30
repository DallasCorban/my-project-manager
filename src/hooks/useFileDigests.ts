// useFileDigests — manages opt-in file content extraction for AI context.
// Each file can be toggled to "digest" — extracting text content (PDF, audio, etc.)
// and making it available to the AI in the item context.
//
// Uses a one-time fetch + local state updates instead of a collection listener
// to avoid Firestore INTERNAL ASSERTION errors from rapid snapshot changes.

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
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
  /** Re-fetch digests from Firestore (e.g., after returning to the tab) */
  refresh: () => Promise<void>;
}

export function useFileDigests(projectId: string | null): UseFileDigestsReturn {
  const user = useAuthStore((s) => s.user);
  const [digests, setDigests] = useState<Record<string, FileDigest>>({});
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // One-time fetch on mount / projectId change
  const fetchDigests = useCallback(async () => {
    if (!projectId || !db) {
      setDigests({});
      return;
    }
    try {
      const colRef = collection(db, 'projects', projectId, 'fileDigests');
      const snapshot = await getDocs(colRef);
      if (!mountedRef.current) return;
      const updated: Record<string, FileDigest> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as FileDigest;
        updated[data.fileId] = data;
      });
      setDigests(updated);
    } catch (err) {
      console.warn('Failed to fetch file digests:', err);
    }
  }, [projectId]);

  useEffect(() => {
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
      // Optimistically update local state
      setDigests((prev) => ({
        ...prev,
        [file.id]: { fileId: file.id, enabled: true, status: 'pending' },
      }));

      // Write to Firestore
      await setDoc(ref, {
        fileId: file.id,
        enabled: true,
        status: 'pending',
      });

      // Trigger backend extraction
      try {
        await requestFileDigest(
          file.id,
          projectId,
          file.storagePath || '',
          file.type || '',
        );
      } catch (err) {
        console.error('File digest request failed:', err);
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        // Update local state and Firestore with error
        setDigests((prev) => ({
          ...prev,
          [file.id]: { fileId: file.id, enabled: true, status: 'error', error: errorMsg },
        }));
        await updateDoc(ref, { status: 'error', error: errorMsg }).catch(() => {});
      }
    } else {
      // Disable — update local state and Firestore
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
  }, [projectId, user, digests]);

  const updateSpeakerLabel = useCallback(async (
    fileId: string,
    speakerKey: string,
    newName: string,
  ) => {
    if (!projectId || !db) return;

    const existing = digests[fileId];
    if (!existing) return;

    const labels = { ...(existing.speakerLabels || {}), [speakerKey]: newName };

    // Update local state
    setDigests((prev) => ({
      ...prev,
      [fileId]: { ...prev[fileId], speakerLabels: labels },
    }));

    // Update Firestore
    const ref = doc(db, 'projects', projectId, 'fileDigests', fileId);
    await updateDoc(ref, { speakerLabels: labels });
  }, [projectId, digests]);

  return { digests, toggleDigest, updateSpeakerLabel, refresh: fetchDigests };
}
