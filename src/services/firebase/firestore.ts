// Firestore error classification and session-level state.
// Ported from App.jsx:65-119.

import { db } from '../../config/firebase';

let firestoreDisabled = false;

const firestoreWarnedKeys = new Set<string>();

/** Check if a Firestore error is an internal assertion failure that warrants disabling */
export const shouldDisableFirestore = (err: unknown): boolean => {
  if (!err) return false;
  const msg = String((err as Error).message || '').toLowerCase();
  if (msg.includes('internal assertion failed')) return true;
  if (msg.includes('internal unhandled error')) return true;
  return false;
};

/** Check if a Firestore error is a permission-denied error */
export const isPermissionDeniedError = (err: unknown): boolean => {
  if (!err) return false;
  const code = String((err as { code?: string }).code || '').toLowerCase();
  if (code === 'permission-denied') return true;
  const msg = String((err as Error).message || '').toLowerCase();
  return msg.includes('missing or insufficient permissions');
};

/** Warn once per key to avoid log spam */
export const warnFirestoreOnce = (key: string, message: string, payload?: unknown): void => {
  if (firestoreWarnedKeys.has(key)) return;
  firestoreWarnedKeys.add(key);
  if (payload !== undefined) {
    console.warn(message, payload);
    return;
  }
  console.warn(message);
};

/** Disable Firestore for the remainder of this session */
export const disableFirestore = (err: unknown, context: string): void => {
  if (firestoreDisabled) return;
  firestoreDisabled = true;
  console.warn('Firestore disabled for this session. Falling back to localStorage.', {
    context,
    error: err,
  });
};

/** Check if Firestore is available for use */
export const canUseFirestore = (): boolean => Boolean(db) && !firestoreDisabled;

/**
 * Get the Firestore instance with non-null assertion.
 * MUST only be called after canUseFirestore() returns true.
 */
export const getDb = () => {
  if (!db) throw new Error('Firestore not initialized');
  return db;
};

/** Handle a Firestore listener error. Returns true if the listener should be unsubscribed. */
export const handleFirestoreListenerError = (error: unknown, context: string): boolean => {
  if (shouldDisableFirestore(error)) {
    disableFirestore(error, context);
    return true;
  }
  if (isPermissionDeniedError(error)) {
    warnFirestoreOnce(
      `listener-permission:${context}`,
      `Firestore listener permission denied (${context}). Unsubscribing that stream.`,
    );
    return true;
  }
  console.warn('Firestore listener failed:', error);
  return false;
};
