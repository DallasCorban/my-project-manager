// Auth modal — sign in / sign up / upgrade / account / reset / resetSent.

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
  sendPasswordReset,
} from '../../services/firebase/auth';

type Mode = 'signin' | 'signup' | 'upgrade' | 'account' | 'reset' | 'resetSent';

// ── Helpers ────────────────────────────────────────────────────────────────

function mapAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    default:
      return (err as Error)?.message || 'Authentication failed.';
  }
}

function getPasswordStrength(pwd: string): { label: string; score: 0 | 1 | 2 | 3 } {
  if (!pwd) return { label: '', score: 0 };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { label: 'Weak', score: 1 };
  if (score <= 3) return { label: 'Fair', score: 2 };
  return { label: 'Strong', score: 3 };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FlowLogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="#2563eb" />
      <rect x="18" y="2" width="12" height="12" rx="2.5" fill="#2563eb" opacity="0.55" />
      <rect x="2" y="18" width="12" height="12" rx="2.5" fill="#2563eb" opacity="0.35" />
      <rect x="18" y="18" width="12" height="12" rx="2.5" fill="#2563eb" opacity="0.18" />
    </svg>
  );
}

function ErrorBanner({ text, darkMode }: { text: string; darkMode: boolean }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 ${
      darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
    }`}>
      <svg className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span className={`text-xs leading-relaxed ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{text}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function AuthModal() {
  const user = useAuthStore((s) => s.user);
  const modalOpen = useAuthStore((s) => s.modalOpen);
  const closeModal = useAuthStore((s) => s.closeModal);
  const darkMode = useUIStore((s) => s.darkMode);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setMode(user.isAnonymous ? 'upgrade' : 'account');
  }, [user]);

  if (!modalOpen) return null;

  const isAnon = !!user?.isAnonymous;
  const strength = getPasswordStrength(password);
  const isSignupLike = mode === 'signup' || mode === 'upgrade';

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setConfirmPassword('');
    setDisplayName('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }
    if (isSignupLike && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (mode === 'upgrade') {
        await upgradeWithEmail(email, password, displayName);
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
      } else if (mode === 'signin') {
        await signInWithEmail(email, password);
      }
      setPassword('');
      setConfirmPassword('');
      setError('');
      closeModal();
    } catch (err) {
      setError(mapAuthError(err));
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
      setConfirmPassword('');
      setError('');
      closeModal();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Enter your email address.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setError('');
      setMode('resetSent');
    } catch (err) {
      setError(mapAuthError(err));
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
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  // Shared input class
  const inputClass = [
    'w-full px-3 py-2.5 rounded-lg text-sm transition-colors outline-none',
    'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    darkMode
      ? 'bg-[#111827] border border-[#323652] text-white placeholder-gray-600'
      : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white',
  ].join(' ');

  const labelClass = `block text-[11px] font-semibold uppercase tracking-widest mb-1.5 ${
    darkMode ? 'text-gray-500' : 'text-gray-400'
  }`;

  const strengthBarColor = ['', 'bg-red-500', 'bg-amber-400', 'bg-emerald-500'][strength.score];
  const strengthTextColor = ['',
    darkMode ? 'text-red-400' : 'text-red-600',
    darkMode ? 'text-amber-400' : 'text-amber-600',
    darkMode ? 'text-emerald-400' : 'text-emerald-600',
  ][strength.score];

  const subtitleByMode: Record<Mode, string> = {
    account:   `Signed in as ${user?.email ?? 'unknown'}`,
    upgrade:   'Save your work',
    signup:    'Create your account',
    signin:    'Welcome back',
    reset:     'Password recovery',
    resetSent: 'Check your inbox',
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        className={`w-[440px] max-w-[92vw] rounded-2xl shadow-2xl overflow-hidden ${
          darkMode
            ? 'bg-[#1c213e] text-white border border-[#323652]/80'
            : 'bg-white text-gray-900 border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500" />

        <div className="p-7">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <FlowLogoMark size={34} />
              <div>
                <div className="text-base font-bold tracking-tight">Flow</div>
                <div className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {subtitleByMode[mode]}
                </div>
              </div>
            </div>
            <button
              onClick={closeModal}
              className={`p-1.5 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
              }`}
              type="button"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ── Reset sent ── */}
          {mode === 'resetSent' ? (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 flex gap-3 ${
                darkMode ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'
              }`}>
                <svg className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className={`text-sm font-medium ${darkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>Reset link sent</p>
                  <p className={`text-xs mt-0.5 leading-relaxed ${darkMode ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
                    Check <strong>{email}</strong> for a link to set a new password.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                Back to sign in
              </button>
            </div>

          ) : mode === 'reset' ? (
            /* ── Forgot password ── */
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Enter your email and we'll send you a reset link.
              </p>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  className={inputClass}
                />
              </div>
              {error && <ErrorBanner text={error} darkMode={darkMode} />}
              <button
                type="submit"
                disabled={busy}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
              <div className={`text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => switchMode('signin')}
                  disabled={busy}
                >
                  ← Back to sign in
                </button>
              </div>
            </form>

          ) : mode === 'account' ? (
            /* ── Account panel ── */
            <div className="space-y-4">
              <div className={`rounded-xl p-4 flex items-center gap-3 ${
                darkMode ? 'bg-white/5' : 'bg-gray-50'
              }`}>
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {(user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  {user?.displayName && (
                    <p className={`text-sm font-semibold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {user.displayName}
                    </p>
                  )}
                  <p className={`text-sm truncate ${user?.displayName ? (darkMode ? 'text-gray-400' : 'text-gray-500') : (darkMode ? 'text-white font-medium' : 'text-gray-900 font-medium')}`}>
                    {user?.email}
                  </p>
                  <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Synced across devices
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSignOut}
                  disabled={busy}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
                    darkMode ? 'bg-white/10 hover:bg-white/15 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                  type="button"
                >
                  Sign out
                </button>
                <button
                  onClick={() => switchMode('signin')}
                  disabled={busy}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-60 ${
                    darkMode ? 'border-[#323652] hover:bg-white/5 text-gray-300' : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}
                  type="button"
                >
                  Switch account
                </button>
              </div>
            </div>

          ) : (
            /* ── Auth form (signin / signup / upgrade) ── */
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Guest data-loss warning — prominent banner */}
              {isAnon && mode === 'signin' && (
                <div className={`rounded-xl p-3.5 flex gap-2.5 ${
                  darkMode
                    ? 'bg-amber-500/10 border border-amber-500/25'
                    : 'bg-amber-50 border border-amber-200'
                }`}>
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className={`text-xs font-semibold ${darkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                      Your guest data won't be kept
                    </p>
                    <p className={`text-[11px] mt-0.5 leading-relaxed ${darkMode ? 'text-amber-500/80' : 'text-amber-700'}`}>
                      Signing in replaces your guest session.{' '}
                      <button
                        type="button"
                        className="underline font-medium"
                        onClick={() => switchMode('upgrade')}
                      >
                        Upgrade instead
                      </button>
                      {' '}to keep your current work.
                    </p>
                  </div>
                </div>
              )}

              {/* Display name — sign-up modes only */}
              {isSignupLike && (
                <div>
                  <label className={labelClass}>Your name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    autoFocus
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
                {/* Strength indicator — sign-up modes only */}
                {isSignupLike && password && (
                  <div className="mt-2">
                    <div className="flex gap-1 mb-1">
                      {([1, 2, 3] as const).map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                            i <= strength.score
                              ? strengthBarColor
                              : darkMode ? 'bg-white/10' : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-[11px] font-medium ${strengthTextColor}`}>{strength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm password — sign-up modes only */}
              {isSignupLike && (
                <div>
                  <label className={labelClass}>Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={[
                      inputClass,
                      confirmPassword && confirmPassword !== password
                        ? darkMode ? 'border-red-500/60' : 'border-red-400'
                        : confirmPassword && confirmPassword === password
                        ? darkMode ? 'border-emerald-500/50' : 'border-emerald-400'
                        : '',
                    ].join(' ')}
                  />
                  {confirmPassword && confirmPassword !== password && (
                    <p className={`text-[11px] mt-1 ${darkMode ? 'text-red-400' : 'text-red-500'}`}>
                      Passwords don't match
                    </p>
                  )}
                </div>
              )}

              {error && <ErrorBanner text={error} darkMode={darkMode} />}

              <button
                type="submit"
                disabled={busy}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
              >
                {busy ? '…' : mode === 'upgrade' ? 'Save my work' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className={`flex-1 h-px ${darkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
                <span className={`text-[11px] ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>or</span>
                <div className={`flex-1 h-px ${darkMode ? 'bg-white/10' : 'bg-gray-200'}`} />
              </div>

              {/* Google */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={busy}
                className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 ${
                  darkMode
                    ? 'border-[#323652] hover:bg-white/5 text-gray-200'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>

              {/* Mode switcher footer */}
              <div className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {mode === 'upgrade' ? (
                  <p className="text-center">
                    Already have an account?{' '}
                    <button
                      type="button"
                      className="text-blue-500 hover:underline"
                      onClick={() => switchMode('signin')}
                      disabled={busy}
                    >
                      Sign in instead
                    </button>
                  </p>
                ) : mode === 'signin' ? (
                  <div className="flex items-center justify-between">
                    <span>
                      New here?{' '}
                      <button
                        type="button"
                        className="text-blue-500 hover:underline"
                        onClick={() => switchMode('signup')}
                        disabled={busy}
                      >
                        Create an account
                      </button>
                    </span>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => switchMode('reset')}
                      disabled={busy}
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : (
                  <p className="text-center">
                    Have an account?{' '}
                    <button
                      type="button"
                      className="text-blue-500 hover:underline"
                      onClick={() => switchMode('signin')}
                      disabled={busy}
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
