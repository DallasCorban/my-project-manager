// Firebase auth service — thin wrappers around Firebase Auth SDK.

import {
  signInAnonymously,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithCredential,
  linkWithPopup,
  EmailAuthProvider,
  type User,
  type Auth,
} from 'firebase/auth';
import { auth } from '../../config/firebase';

export type AuthUser = User;

/** Subscribe to auth state changes. Returns unsubscribe function. */
export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

/** Sign in anonymously (guest mode) */
export const signInAsGuest = async (): Promise<void> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  await signInAnonymously(auth);
};

/** Sign in with email/password */
export const signInWithEmail = async (email: string, password: string): Promise<void> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  await signInWithEmailAndPassword(auth, email, password);
};

/** Create a new account with email/password */
export const signUpWithEmail = async (email: string, password: string): Promise<void> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  await createUserWithEmailAndPassword(auth, email, password);
};

/** Sign in with Google OAuth */
export const signInWithGoogle = async (): Promise<void> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
};

/** Upgrade anonymous account to email/password */
export const upgradeWithEmail = async (email: string, password: string): Promise<void> => {
  if (!auth?.currentUser) throw new Error('No active user session.');
  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(auth.currentUser, credential);
};

/** Upgrade anonymous account to Google */
export const upgradeWithGoogle = async (): Promise<void> => {
  if (!auth?.currentUser) throw new Error('No active user session.');
  const provider = new GoogleAuthProvider();
  await linkWithPopup(auth.currentUser, provider);
};

/** Sign out */
export const signOutUser = async (): Promise<void> => {
  if (!auth) return;
  await firebaseSignOut(auth);
};

export { auth };
export type { Auth };
