// OnboardingModal — shown to brand-new users after their first sign-up.
// Prompts them to name and create their first board.

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import { ensureProject } from '../../stores/memberStore';

const ONBOARDED_KEY = 'pmai_onboarded';

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

export function OnboardingModal() {
  const darkMode = useUIStore((s) => s.darkMode);
  const user = useAuthStore((s) => s.user);
  const clearNewUser = useAuthStore((s) => s.clearNewUser);

  const { projects, addProjectToWorkspace } = useProjectContext();
  const { workspaces, setWorkspaces, setActiveBoardId, setActiveEntityId } = useWorkspaceContext();

  const [visible, setVisible] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [busy, setBusy] = useState(false);

  // Use ref to read latest project count inside the timeout callback
  const projectsLengthRef = useRef(projects.length);
  useEffect(() => { projectsLengthRef.current = projects.length; }, [projects.length]);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    if (localStorage.getItem(ONBOARDED_KEY)) return;

    // Skip for invite flows — user is joining an existing project
    const params = new URLSearchParams(window.location.search);
    if (params.has('invite')) return;

    // Wait 750ms to let Firestore load returning-user data before deciding to show
    const t = setTimeout(() => {
      if (projectsLengthRef.current === 0) {
        setVisible(true);
      }
    }, 750);

    return () => clearTimeout(t);
  }, [user]);

  // Hide if projects appear (Firestore loaded while timer was running)
  useEffect(() => {
    if (projects.length > 0) setVisible(false);
  }, [projects.length]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    clearNewUser();
    setVisible(false);
  };

  const handleCreate = async () => {
    const name = boardName.trim() || 'My First Board';
    setBusy(true);

    try {
      // Ensure at least one workspace exists
      let wsId = workspaces[0]?.id;
      let wsName = workspaces[0]?.name ?? 'My Workspace';

      if (!wsId) {
        wsId = `w${Date.now()}`;
        wsName = 'My Workspace';
        setWorkspaces([{ id: wsId, name: wsName, type: 'workspace' }]);
        setActiveEntityId(wsId);
      }

      const projectId = addProjectToWorkspace(wsId, wsName, name);

      // Eagerly persist to Firestore
      const newBoard = {
        id: projectId,
        workspaceId: wsId,
        workspaceName: wsName,
        name,
        status: 'working',
        groups: [{ id: `g${Date.now()}`, name: 'Group 1', color: '#579bfc' }],
        tasks: [],
      };
      void ensureProject(projectId, newBoard);

      setActiveBoardId(projectId);
      localStorage.setItem(ONBOARDED_KEY, '1');
      clearNewUser();
      setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  const inputClass = [
    'w-full px-3 py-2.5 rounded-lg text-sm transition-colors outline-none',
    'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    darkMode
      ? 'bg-[#111827] border border-[#323652] text-white placeholder-gray-600'
      : 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white',
  ].join(' ');

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className={`w-[420px] max-w-[92vw] rounded-2xl shadow-2xl overflow-hidden ${
        darkMode
          ? 'bg-[#1c213e] text-white border border-[#323652]/80'
          : 'bg-white text-gray-900 border border-gray-200'
      }`}>
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500" />

        <div className="p-7">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <FlowLogoMark size={34} />
            <div>
              <div className="text-base font-bold tracking-tight">Welcome to Flow!</div>
              <div className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Let's create your first board
              </div>
            </div>
          </div>

          {/* Board name input */}
          <div className="mb-5">
            <label className={`block text-[11px] font-semibold uppercase tracking-widest mb-1.5 ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Board name
            </label>
            <input
              type="text"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && handleCreate()}
              placeholder="e.g. Product Roadmap"
              autoFocus
              className={inputClass}
            />
          </div>

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={busy}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60"
          >
            {busy ? 'Creating…' : 'Create board →'}
          </button>

          {/* Skip */}
          <p className={`text-center text-xs mt-3 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            <button type="button" onClick={dismiss} className="hover:underline">
              Skip for now
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
