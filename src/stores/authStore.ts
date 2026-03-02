import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { onAuthChange } from '../services/firebase/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  modalOpen: boolean;
  initialized: boolean;
  isNewUser: boolean;

  setUser: (user: User | null) => void;
  openModal: () => void;
  closeModal: () => void;
  setIsNewUser: (val: boolean) => void;
  clearNewUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  modalOpen: false,
  initialized: false,
  isNewUser: false,

  setUser: (user) => set({ user, isLoading: false, initialized: true }),
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
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
  });

  return unsubscribe;
}
