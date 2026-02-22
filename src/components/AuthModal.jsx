import React, { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

export default function AuthModal({ open, onClose, auth, user, darkMode }) {
  const [mode, setMode] = useState("signin"); // signin | signup | upgrade | account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    if (user.isAnonymous) {
      setMode("upgrade");
    } else {
      setMode("account");
    }
  }, [user]);

  if (!open) return null;

  const isAnon = !!user?.isAnonymous;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!auth) {
      setError("Firebase auth is not available.");
      return;
    }
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (mode === "upgrade") {
        if (!auth.currentUser) throw new Error("No active user session.");
        const credential = EmailAuthProvider.credential(email, password);
        await linkWithCredential(auth.currentUser, credential);
      } else if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setPassword("");
      setError("");
      onClose?.();
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!auth) {
      setError("Firebase auth is not available.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      if (mode === "upgrade") {
        if (!auth.currentUser) throw new Error("No active user session.");
        await linkWithPopup(auth.currentUser, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
      setPassword("");
      setError("");
      onClose?.();
    } catch (err) {
      setError(err?.message || "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    setBusy(true);
    try {
      await signOut(auth);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Sign out failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-[420px] max-w-[92vw] rounded-xl shadow-2xl p-6 ${
          darkMode ? "bg-[#1c213e] text-white border border-[#2a2d44]" : "bg-white text-gray-900 border border-gray-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">Account</h3>
            {isAnon ? (
              <p className={`text-xs mt-1 ${darkMode ? "text-gray-300" : "text-gray-500"}`}>
                You are in Guest mode. Upgrade to keep your data across devices.
              </p>
            ) : (
              <p className={`text-xs mt-1 ${darkMode ? "text-gray-300" : "text-gray-500"}`}>
                Signed in as {user?.email || "unknown"}.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className={`text-sm px-2 py-1 rounded ${
              darkMode ? "hover:bg-white/10" : "hover:bg-gray-100"
            }`}
            type="button"
          >
            Close
          </button>
        </div>

        {mode === "account" ? (
          <div className="space-y-3">
            <div className={`text-sm ${darkMode ? "text-gray-200" : "text-gray-700"}`}>
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
                onClick={() => setMode("signin")}
                disabled={busy}
                className={`px-4 py-2 rounded-md text-sm font-semibold border ${
                  darkMode ? "border-[#2a2d44] hover:bg-white/5" : "border-gray-200 hover:bg-gray-50"
                }`}
                type="button"
              >
                Use another account
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`w-full px-3 py-2 rounded-md text-sm outline-none ${
                  darkMode ? "bg-[#111827] border border-[#2a2d44] text-white" : "bg-white border border-gray-200 text-gray-900"
                }`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full px-3 py-2 rounded-md text-sm outline-none ${
                  darkMode ? "bg-[#111827] border border-[#2a2d44] text-white" : "bg-white border border-gray-200 text-gray-900"
                }`}
              />
            </div>

            {error && (
              <div className={`text-xs ${darkMode ? "text-red-300" : "text-red-600"}`}>{error}</div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full px-4 py-2 rounded-md text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            >
              {mode === "upgrade" ? "Upgrade to Account" : mode === "signup" ? "Create Account" : "Sign In"}
            </button>
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={busy}
              className={`w-full px-4 py-2 rounded-md text-sm font-semibold border ${
                darkMode ? "border-[#2a2d44] hover:bg-white/5" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              Continue with Google
            </button>

            <div className="text-xs text-gray-400">
              {mode === "upgrade" ? (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setMode("signin")}
                    disabled={busy}
                  >
                    Sign in instead
                  </button>
                </>
              ) : mode === "signin" ? (
                <>
                  New here?{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setMode("signup")}
                    disabled={busy}
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Have an account?{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setMode("signin")}
                    disabled={busy}
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>

            {isAnon && mode === "signin" && (
              <div className={`text-[11px] ${darkMode ? "text-amber-300" : "text-amber-600"}`}>
                Signing in to an existing account will not keep your current Guest data. Use “Upgrade” instead to keep it.
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
