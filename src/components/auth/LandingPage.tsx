// LandingPage — shown to unauthenticated visitors.
// Replaces the full app for guests; AuthModal renders on top of it.

import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';

interface LandingPageProps {
  inviteMode?: boolean;
}

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

/** Lightweight app preview illustration */
function AppPreview({ darkMode }: { darkMode: boolean }) {
  const bg = darkMode ? '#1c213e' : '#ffffff';
  const border = darkMode ? '#323652' : '#e5e7eb';
  const bar1 = '#3b82f6';
  const bar2 = '#a855f7';
  const bar3 = '#10b981';
  const bar4 = '#f59e0b';
  const rowBg = darkMode ? '#242847' : '#f9fafb';
  const textLine = darkMode ? '#3a3f6a' : '#e5e7eb';

  return (
    <div
      className="w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-2xl border"
      style={{ borderColor: border, background: bg }}
    >
      {/* Fake toolbar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: border, background: darkMode ? '#181b34' : '#f3f4f6' }}
      >
        <div className="w-3 h-3 rounded-full bg-red-400 opacity-70" />
        <div className="w-3 h-3 rounded-full bg-yellow-400 opacity-70" />
        <div className="w-3 h-3 rounded-full bg-green-400 opacity-70" />
        <div className="flex-1 mx-4 h-5 rounded" style={{ background: darkMode ? '#242847' : '#e5e7eb' }} />
      </div>

      {/* Fake Gantt rows */}
      <div className="p-4 space-y-2">
        {[
          { label: 'Discovery Phase', width: '45%', color: bar1, progress: 100 },
          { label: 'Wireframing', width: '60%', color: bar2, progress: 65 },
          { label: 'UI Design', width: '35%', offset: '20%', color: bar3, progress: 30 },
          { label: 'Frontend Dev', width: '50%', offset: '35%', color: bar4, progress: 10 },
        ].map((row, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: rowBg }}
          >
            {/* Task name placeholder */}
            <div className="w-28 shrink-0">
              <div className="h-2 rounded-full" style={{ background: textLine, width: '80%' }} />
            </div>
            {/* Gantt bar */}
            <div className="flex-1 relative h-5 rounded" style={{ background: darkMode ? '#2a2f52' : '#e5e7eb' }}>
              <div
                className="absolute top-0 bottom-0 rounded flex items-center overflow-hidden"
                style={{ left: (row as { offset?: string }).offset ?? '0%', width: row.width, background: row.color + '33' }}
              >
                <div
                  className="h-full rounded"
                  style={{ width: `${row.progress}%`, background: row.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage({ inviteMode }: LandingPageProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const openModal = useAuthStore((s) => s.openModal);
  const openModalInMode = useAuthStore((s) => s.openModalInMode);

  return (
    <div className={`min-h-screen flex flex-col ${
      darkMode ? 'bg-[#181b34] text-white' : 'bg-[#eceff8] text-gray-900'
    }`}>

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-2.5">
          <FlowLogoMark size={28} />
          <span className="text-lg font-bold tracking-tight">Flow</span>
        </div>
        <button
          onClick={openModal}
          className={`text-sm font-semibold px-4 py-2 rounded-lg transition-colors ${
            darkMode
              ? 'text-gray-300 hover:bg-white/10'
              : 'text-gray-600 hover:bg-black/5'
          }`}
        >
          Sign in
        </button>
      </nav>

      {/* ── Invite banner ── */}
      {inviteMode && (
        <div className="mx-auto mt-2 w-full max-w-lg px-6">
          <div className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm ${
            darkMode
              ? 'bg-blue-600/15 border-blue-500/25 text-blue-200'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}>
            <svg className="w-5 h-5 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <span className="flex-1">
              <strong>You've been invited to join a project.</strong>
              {' '}Sign in or create an account to accept.
            </span>
            <button
              onClick={() => openModalInMode('signup')}
              className="shrink-0 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Accept invite →
            </button>
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center pt-8 pb-4">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-6 ${
          darkMode ? 'bg-blue-600/20 text-blue-300' : 'bg-blue-100 text-blue-700'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Free to get started
        </div>

        <h1 className={`text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight max-w-2xl ${
          darkMode ? 'text-white' : 'text-gray-900'
        }`}>
          Project management,<br />
          <span className="text-blue-600">the way your team works.</span>
        </h1>

        <p className={`text-lg mb-10 max-w-md leading-relaxed ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          Bring your tasks, timelines, and team together in one visual workspace.
        </p>

        <div className="flex items-center gap-3 flex-wrap justify-center">
          <button
            onClick={() => openModalInMode('signup')}
            className="px-7 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-blue-600/25"
          >
            Get started free
          </button>
          <button
            onClick={openModal}
            className={`px-7 py-3 rounded-xl font-semibold text-sm border transition-colors ${
              darkMode
                ? 'border-[#323652] hover:bg-white/5 text-gray-300'
                : 'border-gray-300 hover:bg-white text-gray-700'
            }`}
          >
            Sign in
          </button>
        </div>

        {/* Feature pills */}
        <div className={`flex flex-wrap justify-center gap-2 mt-8 text-xs font-medium ${
          darkMode ? 'text-gray-500' : 'text-gray-400'
        }`}>
          {['Gantt charts', 'Team roles', 'Invite by email', 'Real-time sync', 'Dark mode'].map((f) => (
            <span
              key={f}
              className={`px-3 py-1 rounded-full border ${
                darkMode ? 'border-[#323652]' : 'border-gray-200'
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </main>

      {/* ── App preview ── */}
      <div className="px-6 pb-10 max-w-2xl mx-auto w-full">
        <AppPreview darkMode={darkMode} />
      </div>

      {/* ── Footer ── */}
      <footer className={`py-5 text-center text-xs ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
        © {new Date().getFullYear()} Flow · Built with ❤️
      </footer>
    </div>
  );
}
