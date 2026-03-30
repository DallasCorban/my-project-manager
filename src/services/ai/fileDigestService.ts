// fileDigestService — triggers file content extraction via Cloud Function.
// Called by useFileDigests when a file's digest toggle is enabled.

import { auth } from '../../config/firebase';

/**
 * Request file content extraction from the backend.
 * The backend will:
 *  - Audio: transcribe via Deepgram with speaker diarization
 *  - PDF: extract text via pdf-parse
 *  - Text files: read as UTF-8
 *  - Other: return an error
 *
 * Results are written to projects/{projectId}/fileDigests/{fileId} in Firestore.
 */
export async function requestFileDigest(
  fileId: string,
  projectId: string,
  storagePath: string,
  fileType: string,
): Promise<void> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not authenticated');

  const idToken = await user.getIdToken();
  const digestUrl = import.meta.env.VITE_AI_DIGEST_URL;

  if (!digestUrl) {
    throw new Error('VITE_AI_DIGEST_URL not configured');
  }

  const res = await fetch(digestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fileId,
      projectId,
      storagePath,
      fileType,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Digest request failed (${res.status})`);
  }
}
