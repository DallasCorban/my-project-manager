// fileSync — Firebase Storage upload + Firestore metadata.
// Ported from App.jsx:3394-3465 (file upload flow).

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { storage } from '../../config/firebase';
import { canUseFirestore, getDb, handleFirestoreListenerError } from './firestore';
import type { ProjectFile, FileAccess } from '../../types/file';

/**
 * Upload files to Firebase Storage and create Firestore metadata documents.
 * Returns an array of uploaded file metadata.
 */
export async function uploadFiles(
  projectId: string,
  taskId: string,
  subitemId: string | null,
  files: FileList | File[],
  userId: string,
  userEmail: string,
): Promise<ProjectFile[]> {
  if (!storage || !canUseFirestore()) return [];

  const baseId = Date.now();
  const uploadedFiles: ProjectFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileId = `f${baseId}_${i}`;
    const targetId = subitemId || taskId;
    const storagePath = `projects/${projectId}/items/${taskId}/${targetId}/${fileId}`;

    try {
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);

      const defaultAccess: FileAccess = {
        minRole: 'viewer',
        allowShareLink: false,
        shareToken: null,
      };

      const fileMeta: Omit<ProjectFile, 'id'> = {
        projectId,
        taskId,
        subitemId: subitemId || null,
        name: file.name,
        size: file.size,
        type: file.type,
        url,
        storagePath,
        createdBy: userId,
        author: userEmail || 'Guest',
        access: defaultAccess,
      };

      // Create Firestore metadata document
      const filesRef = collection(getDb(), 'projects', projectId, 'files');
      const docRef = await addDoc(filesRef, {
        ...fileMeta,
        createdAt: serverTimestamp(),
      });

      uploadedFiles.push({
        ...fileMeta,
        id: docRef.id,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`Failed to upload file ${file.name}:`, err);
    }
  }

  return uploadedFiles;
}

/**
 * Create file metadata from a local DataURL (localStorage-only fallback).
 */
export function createLocalFile(
  file: File,
  dataUrl: string,
  userId: string,
  userEmail: string,
): ProjectFile {
  return {
    id: `f${Date.now()}`,
    name: file.name,
    size: file.size,
    type: file.type,
    url: dataUrl,
    createdAt: new Date().toISOString(),
    createdBy: userId,
    author: userEmail || 'Guest',
  };
}

/**
 * Subscribe to all files for a project.
 */
export function subscribeToProjectFiles(
  projectId: string,
  onUpdate: (files: ProjectFile[]) => void,
): Unsubscribe {
  if (!canUseFirestore()) return () => {};

  const filesRef = collection(getDb(), 'projects', projectId, 'files');

  return onSnapshot(
    filesRef,
    (snapshot) => {
      const files: ProjectFile[] = snapshot.docs.map((d) => ({
        ...(d.data() as ProjectFile),
        id: d.id,
      }));
      onUpdate(files);
    },
    (err) => {
      handleFirestoreListenerError(err, `fileSync:${projectId}`);
    },
  );
}
