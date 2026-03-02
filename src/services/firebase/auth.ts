// Firebase auth service — thin wrappers around Firebase Auth SDK.

import {
  signInAnonymously,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithCredential,
  linkWithPopup,
  EmailAuthProvider,
  type User,
  type Auth,
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../../config/firebase';

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

/** Create a new account with email/password (optionally set display name) */
export const signUpWithEmail = async (email: string, password: string, displayName?: string): Promise<void> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
};

/** Sign in with Google OAuth. Returns whether this is a brand-new account. */
export const signInWithGoogle = async (): Promise<{ isNewUser: boolean }> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return { isNewUser: result.additionalUserInfo?.isNewUser ?? false };
};

/** Upgrade anonymous account to email/password (optionally set display name) */
export const upgradeWithEmail = async (email: string, password: string, displayName?: string): Promise<void> => {
  if (!auth?.currentUser) throw new Error('No active user session.');
  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(auth.currentUser, credential);
  if (displayName?.trim()) {
    await updateProfile(auth.currentUser, { displayName: displayName.trim() });
  }
};

/** Upgrade anonymous account to Google */
export const upgradeWithGoogle = async (): Promise<void> => {
  if (!auth?.currentUser) throw new Error('No active user session.');
  const provider = new GoogleAuthProvider();
  await linkWithPopup(auth.currentUser, provider);
};

/** Send a password reset email */
export const sendPasswordReset = async (email: string): Promise<void> => {
  if (!auth) throw new Error('Firebase auth is not available.');
  await sendPasswordResetEmail(auth, email);
};

/**
 * Upload a profile photo to Firebase Storage and update the user's profile.
 * Stores at users/{uid}/avatar — overwrites any previous photo.
 */
export const uploadProfilePhoto = async (user: User, file: File): Promise<string> => {
  if (!storage) throw new Error('Firebase Storage is not available.');
  const storageRef = ref(storage, `users/${user.uid}/avatar`);
  const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
  const photoURL = await getDownloadURL(snapshot.ref);
  await updateProfile(user, { photoURL });
  return photoURL;
};

/** Sign out */
export const signOutUser = async (): Promise<void> => {
  if (!auth) return;
  await firebaseSignOut(auth);
};

export { auth };
export type { Auth };
