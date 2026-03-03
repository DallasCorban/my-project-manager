// userProfileSync — ensures a /users/{userId} profile document exists in Firestore.
// Called on auth state change so the profile stays current (display name, avatar, email).

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { canUseFirestore, getDb, handleFirestoreListenerError } from './firestore';
import type { User } from 'firebase/auth';

/**
 * Write or update the user profile document at /users/{userId}.
 * Uses merge so it never overwrites fields set elsewhere (e.g. preferences).
 */
export async function ensureUserProfile(user: User): Promise<void> {
  if (!canUseFirestore()) return;

  try {
    const userRef = doc(getDb(), 'users', user.uid);
    await setDoc(
      userRef,
      {
        displayName: user.displayName || '',
        email: (user.email || '').toLowerCase(),
        avatarUrl: user.photoURL || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreListenerError(err, `ensureUserProfile:${user.uid}`);
  }
}
