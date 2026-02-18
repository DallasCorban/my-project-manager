// useInviteAccept — detect invite URL parameters and auto-accept on auth.

import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { tryAutoAcceptInvite } from '../services/firebase/inviteSync';

/**
 * Hook that checks URL parameters for invite tokens on auth change.
 * Auto-accepts matching invites for the authenticated user.
 */
export function useInviteAccept(): void {
  const user = useAuthStore((s) => s.user);
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (!user || user.isAnonymous || hasAttempted.current) return;

    // Only attempt once per session
    const params = new URLSearchParams(window.location.search);
    if (!params.has('invite')) return;

    hasAttempted.current = true;

    tryAutoAcceptInvite(user.uid, user.email || '').then((accepted) => {
      if (accepted) {
        console.log('Invite auto-accepted successfully');
      }
    });
  }, [user]);
}
