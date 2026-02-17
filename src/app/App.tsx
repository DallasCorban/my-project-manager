import { useEffect } from 'react';
import { useAuthStore, initAuth } from '../stores/authStore';
import { initDarkMode } from '../stores/uiStore';
import { ProjectDataProvider } from '../stores/projectStore';
import { AppShell } from '../components/layout/AppShell';
import { AuthModal } from '../components/auth/AuthModal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export default function App() {
  const isLoading = useAuthStore((s) => s.isLoading);

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
        <div className="text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-3 text-blue-500" />
          <p className="text-sm text-slate-500 dark:text-gray-400">Loading Flow...</p>
        </div>
      </div>
    );
  }

  return (
    <ProjectDataProvider>
      <AppShell />
      <AuthModal />
    </ProjectDataProvider>
  );
}
