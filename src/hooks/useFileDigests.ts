// useFileDigests — manages opt-in file content extraction for AI context.
// Each file can be toggled to "digest" — extracting text content (PDF, audio, etc.)
// and making it available to the AI in the item context.

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
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
}

export function useFileDigests(projectId: string | null): UseFileDigestsReturn {
  const user = useAuthStore((s) => s.user);
  const [digests, setDigests] = useState<Record<string, FileDigest>>({});
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Subscribe to fileDigests collection
  useEffect(() => {
    if (!projectId || !db) {
      setDigests({});
      return;
    }

    const colRef = collection(db, 'projects', projectId, 'fileDigests');
    return onSnapshot(colRef, (snapshot) => {
      if (!mountedRef.current) return;
      const updated: Record<string, FileDigest> = {};
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as FileDigest;
        updated[data.fileId] = data;
      });
      setDigests(updated);
    }, () => setDigests({}));
  }, [projectId]);

  const toggleDigest = useCallback(async (file: ProjectFile) => {
    if (!projectId || !db || !user) return;

    const existing = digests[file.id];
    const newEnabled = !existing?.enabled;

    const ref = doc(db, 'projects', projectId, 'fileDigests', file.id);

    if (newEnabled) {
      // Enable and trigger extraction
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
        // Update status to error
        await updateDoc(ref, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    } else {
      // Disable
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
    const ref = doc(db, 'projects', projectId, 'fileDigests', fileId);
    await updateDoc(ref, { speakerLabels: labels });
  }, [projectId, digests]);

  return { digests, toggleDigest, updateSpeakerLabel };
}
