import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { onAuthChange, signInAsGuest } from '../services/firebase/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  modalOpen: boolean;
  initialized: boolean;

  setUser: (user: User | null) => void;
  openModal: () => void;
  closeModal: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  modalOpen: false,
  initialized: false,

  setUser: (user) => set({ user, isLoading: false, initialized: true }),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
}));

/**
 * Initialize auth listener. Call once at app startup.
 * Handles anonymous-first auth: if no user is signed in, auto-signs in anonymously.
 */
export function initAuth(): () => void {
  const unsubscribe = onAuthChange(async (user) => {
    if (user) {
      useAuthStore.getState().setUser(user);
      return;
    }
    // No user — try anonymous sign-in
    try {
      await signInAsGuest();
    } catch (err) {
      console.warn('Anonymous sign-in failed:', err);
      useAuthStore.getState().setUser(null);
    }
  });

  return unsubscribe;
}
