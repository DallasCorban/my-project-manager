// Auth modal — sign in / sign up / upgrade / account.
// Ported from src/components/AuthModal.jsx to TypeScript with Zustand integration.

import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import {
  signInWithEmail,
  signUpWithEmail,
  upgradeWithEmail,
  signInWithGoogle,
  upgradeWithGoogle,
  signOutUser,
} from '../../services/firebase/auth';

type Mode = 'signin' | 'signup' | 'upgrade' | 'account';

export function AuthModal() {
  const user = useAuthStore((s) => s.user);
  const modalOpen = useAuthStore((s) => s.modalOpen);
  const closeModal = useAuthStore((s) => s.closeModal);
  const darkMode = useUIStore((s) => s.darkMode);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setMode(user.isAnonymous ? 'upgrade' : 'account');
  }, [user]);

  if (!modalOpen) return null;

  const isAnon = !!user?.isAnonymous;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (mode === 'upgrade') {
        await upgradeWithEmail(email, password);
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password);
      } else if (mode === 'signin') {
        await signInWithEmail(email, password);
      }
      setPassword('');
      setError('');
      closeModal();
    } catch (err) {
      setError((err as Error)?.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setBusy(true);
    try {
      if (mode === 'upgrade') {
        await upgradeWithGoogle();
      } else {
        await signInWithGoogle();
      }
      setPassword('');
      setError('');
      closeModal();
    } catch (err) {
      setError((err as Error)?.message || 'Google sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOutUser();
      closeModal();
    } catch (err) {
      setError((err as Error)?.message || 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={closeModal}
    >
      <div
        className={`w-[420px] max-w-[92vw] rounded-xl shadow-2xl p-6 ${
          darkMode
            ? 'bg-[#1c213e] text-white border border-[#2a2d44]'
            : 'bg-white text-gray-900 border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">Account</h3>
            <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
              {isAnon
                ? 'You are in Guest mode. Upgrade to keep your data across devices.'
                : `Signed in as ${user?.email || 'unknown'}.`}
            </p>
          </div>
          <button
            onClick={closeModal}
            className={`text-sm px-2 py-1 rounded ${
              darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
            }`}
            type="button"
          >
            Close
          </button>
        </div>

        {/* Account mode */}
        {mode === 'account' ? (
          <div className="space-y-3">
            <div className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Your data will sync anywhere you sign in with this email.
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSignOut}
                disabled={busy}
                className="px-4 py-2 rounded-md text-sm font-semibold bg-gray-600 hover:bg-gray-700 text-white disabled:opacity-60"
                type="button"
              >
                Sign Out
              </button>
              <button
                onClick={() => setMode('signin')}
                disabled={busy}
                className={`px-4 py-2 rounded-md text-sm font-semibold border ${
                  darkMode ? 'border-[#2a2d44] hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'
                }`}
                type="button"
              >
                Use another account
              </button>
            </div>
          </div>
        ) : (
          /* Auth form */
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`w-full px-3 py-2 rounded-md text-sm outline-none ${
                  darkMode
                    ? 'bg-[#111827] border border-[#2a2d44] text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-3 py-2 rounded-md text-sm outline-none ${
                  darkMode
                    ? 'bg-[#111827] border border-[#2a2d44] text-white'
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              />
            </div>

            {error && (
              <div className={`text-xs ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            >
              {mode === 'upgrade'
                ? 'Upgrade to Account'
                : mode === 'signup'
                  ? 'Create Account'
                  : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={busy}
              className={`w-full px-4 py-2 rounded-md text-sm font-semibold border ${
                darkMode ? 'border-[#2a2d44] hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              Continue with Google
            </button>

            {/* Mode switcher links */}
            <div className="text-xs text-gray-400">
              {mode === 'upgrade' ? (
                <>
                  Already have an account?{' '}
                  <button type="button" className="underline" onClick={() => setMode('signin')} disabled={busy}>
                    Sign in instead
                  </button>
                </>
              ) : mode === 'signin' ? (
                <>
                  New here?{' '}
                  <button type="button" className="underline" onClick={() => setMode('signup')} disabled={busy}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Have an account?{' '}
                  <button type="button" className="underline" onClick={() => setMode('signin')} disabled={busy}>
                    Sign in
                  </button>
                </>
              )}
            </div>

            {/* Guest warning */}
            {isAnon && mode === 'signin' && (
              <div className={`text-[11px] ${darkMode ? 'text-amber-300' : 'text-amber-600'}`}>
                Signing in to an existing account will not keep your current Guest data. Use
                &quot;Upgrade&quot; instead to keep it.
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
