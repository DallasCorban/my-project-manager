import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../services/firebase/auth';
import { ensureUserProfile } from '../services/firebase/userProfileSync';

type ModalMode = 'signin' | 'signup' | 'upgrade' | 'account' | 'reset' | 'resetSent';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  modalOpen: boolean;
  requestedMode: ModalMode | null;
  initialized: boolean;
  isNewUser: boolean;

  setUser: (user: User | null) => void;
  openModal: () => void;
  openModalInMode: (mode: ModalMode) => void;
  closeModal: () => void;
  clearRequestedMode: () => void;
  setIsNewUser: (val: boolean) => void;
  clearNewUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  modalOpen: false,
  requestedMode: null,
  initialized: false,
  isNewUser: false,

  setUser: (user) => set({ user, isLoading: false, initialized: true }),
  openModal: () => set({ modalOpen: true }),
  openModalInMode: (mode) => set({ modalOpen: true, requestedMode: mode }),
  closeModal: () => set({ modalOpen: false, requestedMode: null }),
  clearRequestedMode: () => set({ requestedMode: null }),
  setIsNewUser: (val) => set({ isNewUser: val }),
  clearNewUser: () => set({ isNewUser: false }),
}));

/**
 * Initialize auth listener. Call once at app startup.
 * No anonymous sign-in — unauthenticated users see the landing page.
 */
export function initAuth(): () => void {
  const unsubscribe = onAuthChange((user) => {
    useAuthStore.getState().setUser(user);
    // Sync user profile to Firestore on every sign-in (merge, non-blocking)
    if (user && !user.isAnonymous) {
      ensureUserProfile(user);
    }
  });

  return unsubscribe;
}
