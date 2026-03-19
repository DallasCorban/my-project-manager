// User profile cache — lightweight Zustand store for resolving UIDs to
// display names and avatar URLs.  Fetches from Firestore /users/{uid} docs
// written by ensureUserProfile (userProfileSync.ts).

import { create } from 'zustand';
import { doc, getDoc } from 'firebase/firestore';
import { canUseFirestore, getDb } from '../services/firebase/firestore';

export interface UserProfile {
  displayName: string;
  email: string;
  avatarUrl: string;
}

interface ProfileCacheState {
  profiles: Record<string, UserProfile>;
  /** UIDs currently being fetched (de-dupe). */
  pending: Set<string>;

  /** Return cached profile or null. */
  getProfile: (uid: string) => UserProfile | null;

  /** Fetch any UIDs not yet cached (no-op for already-cached / in-flight). */
  fetchProfiles: (uids: string[]) => void;
}

export const useProfileCache = create<ProfileCacheState>()((set, get) => ({
  profiles: {},
  pending: new Set(),

  getProfile: (uid) => get().profiles[uid] ?? null,

  fetchProfiles: (uids) => {
    if (!canUseFirestore()) return;
    const { profiles, pending } = get();
    const missing = uids.filter((u) => !profiles[u] && !pending.has(u));
    if (missing.length === 0) return;

    // Mark as pending immediately
    const nextPending = new Set(pending);
    missing.forEach((u) => nextPending.add(u));
    set({ pending: nextPending });

    // Fetch each missing profile
    const db = getDb();
    for (const uid of missing) {
      getDoc(doc(db, 'users', uid))
        .then((snap) => {
          const data = snap.data();
          const profile: UserProfile = {
            displayName: data?.displayName || '',
            email: data?.email || '',
            avatarUrl: data?.avatarUrl || '',
          };
          set((s) => {
            const np = new Set(s.pending);
            np.delete(uid);
            return {
              profiles: { ...s.profiles, [uid]: profile },
              pending: np,
            };
          });
        })
        .catch(() => {
          // Remove from pending on error so it can be retried later
          set((s) => {
            const np = new Set(s.pending);
            np.delete(uid);
            return { pending: np };
          });
        });
    }
  },
}));
