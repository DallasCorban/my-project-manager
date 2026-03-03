import { useEffect } from 'react';
import { useAuthStore, initAuth } from '../stores/authStore';
import { initDarkMode } from '../stores/uiStore';
import { ProjectDataProvider } from '../stores/projectStore';
import { WorkspaceDataProvider } from '../stores/workspaceStore';
import { AppShell } from '../components/layout/AppShell';
import { AuthModal } from '../components/auth/AuthModal';
import { LandingPage } from '../components/auth/LandingPage';
import { OnboardingModal } from '../components/auth/OnboardingModal';

export default function App() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  // Initialize auth listener + dark mode on mount
  useEffect(() => {
    initDarkMode();
    const unsub = initAuth();
    return unsub;
  }, []);

  // Loading state while auth initializes
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eceff8] dark:bg-[#181b34] transition-colors">
        <div className="flex flex-col items-center gap-5">

          {/* Animated logo mark */}
          <div className="relative">
            <svg
              width="52"
              height="52"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ animation: 'flowPulse 2s ease-in-out infinite' }}
            >
              <rect x="2" y="2" width="12" height="12" rx="2.5" fill="#2563eb" />
              <rect x="18" y="2" width="12" height="12" rx="2.5" fill="#2563eb" opacity="0.55" />
              <rect x="2" y="18" width="12" height="12" rx="2.5" fill="#2563eb" opacity="0.35" />
              <rect x="18" y="18" width="12" height="12" rx="2.5" fill="#2563eb" opacity="0.18" />
            </svg>
          </div>

          {/* Wordmark + subtitle */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold tracking-tight text-gray-800 dark:text-white">
              Flow
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500 tracking-wide">
              Loading your workspace…
            </span>
          </div>

          {/* Animated progress bar */}
          <div className="w-24 h-0.5 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ animation: 'flowSlide 1.6s ease-in-out infinite' }}
            />
          </div>

        </div>

        <style>{`
          @keyframes flowPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.75; transform: scale(0.96); }
          }
          @keyframes flowSlide {
            0%   { width: 0%;   margin-left: 0%; }
            50%  { width: 55%;  margin-left: 22%; }
            100% { width: 0%;   margin-left: 100%; }
          }
        `}</style>
      </div>
    );
  }

  // ── Auth gate ──
  // Unauthenticated or anonymous users see the landing page.
  // AuthModal renders on top so sign-in/sign-up works from the landing page.
  if (!user || user.isAnonymous) {
    const params = new URLSearchParams(window.location.search);
    const inviteMode = params.has('invite');
    return (
      <>
        <LandingPage inviteMode={inviteMode} />
        <AuthModal />
      </>
    );
  }

  // ── Authenticated ──
  // ProjectDataProvider and WorkspaceDataProvider are intentionally NOT mounted
  // for unauthenticated users — they start Firestore listeners and read localStorage.
  return (
    <ProjectDataProvider>
      <WorkspaceDataProvider>
        <AppShell />
        <AuthModal />
        <OnboardingModal />
      </WorkspaceDataProvider>
    </ProjectDataProvider>
  );
}
