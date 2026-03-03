// App header — entity name, view tabs, settings, auth/members buttons.
// Shows user role badge and activity sidebar toggle.

import { Briefcase, LayoutDashboard, MessageCircle, Moon, Sun } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useMemberStore } from '../../stores/memberStore';
import { EditableText } from '../shared/EditableText';
import { ROLE_BADGE_CLASSES } from '../../config/constants';
import { generateAvatarColor, getInitials } from '../../utils/avatar';

interface AppHeaderProps {
  entityName: string;
  entityType: 'workspace' | 'dashboard';
  onUpdateEntityName: (name: string) => void;
  canEditEntityName: boolean;
  activeProjectId?: string | null;
}

export function AppHeader({
  entityName,
  entityType,
  onUpdateEntityName,
  canEditEntityName,
  activeProjectId,
}: AppHeaderProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const showEmptyNameToast = useUIStore((s) => s.showEmptyNameToast);
  const updatesPanelTarget = useUIStore((s) => s.updatesPanelTarget);
  const openUpdatesPanel = useUIStore((s) => s.openUpdatesPanel);
  const closeUpdatesPanel = useUIStore((s) => s.closeUpdatesPanel);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openModal);
  const setMembersModalOpen = useUIStore((s) => s.setMembersModalOpen);
  const selfMembership = useMemberStore(
    (s) => (activeProjectId ? s.selfMembershipByProject[activeProjectId] : null) ?? null,
  );
  const selfRole = selfMembership?.role ?? null;

  const isActivityOpen = Boolean(updatesPanelTarget);

  // Role badge
  const getRoleBadge = () => {
    if (!selfRole) return null;
    const colorClass = ROLE_BADGE_CLASSES[selfRole] ?? ROLE_BADGE_CLASSES.viewer;
    return (
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${colorClass}`}>
        {selfRole}
      </span>
    );
  };

  return (
    <>
      {/* Top bar — entity name + auth buttons */}
      <div
        className={`h-14 border-b px-6 flex items-center justify-between shrink-0 ${
          darkMode ? 'border-[#323652] bg-[#181b34]' : 'border-[#bec3d4] bg-white'
        }`}
      >
        <div className="flex items-center gap-3">
          {entityType === 'workspace' ? (
            <Briefcase size={20} className="text-gray-400" />
          ) : (
            <LayoutDashboard size={20} className="text-purple-500" />
          )}
          <EditableText
            value={entityName}
            onChange={canEditEntityName ? onUpdateEntityName : undefined}
            readOnly={!canEditEntityName}
            revertOnEmpty
            onEmpty={showEmptyNameToast}
            className={`text-lg font-bold ${
              darkMode ? 'text-white' : 'text-gray-800'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Role badge */}
          {getRoleBadge()}

          {/* Dark/light toggle — only shown when sidebar is hidden (mobile/tablet) */}
          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'text-yellow-400 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Activity toggle */}
          <button
            onClick={() => {
              if (isActivityOpen) {
                closeUpdatesPanel();
              } else {
                // Open a global activity view (no specific task)
                openUpdatesPanel({ taskId: '__global__', subitemId: null, projectId: '' });
              }
            }}
            className={`p-2 rounded-lg transition-colors ${
              isActivityOpen
                ? 'bg-blue-500/15 text-blue-500'
                : darkMode
                  ? 'text-gray-400 hover:bg-white/10'
                  : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Activity"
          >
            <MessageCircle size={16} />
          </button>

          {/* Members button — redirects guests to auth modal with tooltip */}
          <div className="relative group">
            <button
              onClick={() => {
                if (!user || user.isAnonymous) {
                  openAuthModal();
                } else {
                  setMembersModalOpen(true);
                }
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                !user || user.isAnonymous
                  ? darkMode
                    ? 'border-[#323652] text-gray-600 opacity-60 hover:opacity-80'
                    : 'border-gray-200 text-gray-400 opacity-60 hover:opacity-80'
                  : darkMode
                    ? 'bg-[#1c213e] border-[#323652] text-gray-200 hover:bg-[#202336]'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Members
            </button>
            {/* Tooltip — only shown for guests */}
            {(!user || user.isAnonymous) && (
              <div
                className={`pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 ${
                  darkMode ? 'bg-[#2a2f52] text-gray-200' : 'bg-gray-800 text-white'
                }`}
              >
                Sign in to invite &amp; manage members
                {/* Arrow */}
                <span
                  className={`absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent ${
                    darkMode ? 'border-t-[#2a2f52]' : 'border-t-gray-800'
                  }`}
                />
              </div>
            )}
          </div>
          {(() => {
            const avatarSeed = user?.displayName || user?.email || 'user';
            const avatarBg   = generateAvatarColor(avatarSeed);
            const avatarText = getInitials(user?.displayName ?? '', user?.email ?? '');
            return (
              <button
                onClick={openAuthModal}
                className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-full border transition-colors ${
                  darkMode
                    ? 'bg-[#1c213e] border-[#323652] text-gray-200 hover:bg-[#202336]'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {/* Avatar */}
                <span
                  className="w-5 h-5 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: user?.photoURL ? undefined : avatarBg }}
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    avatarText
                  )}
                </span>
                <span>
                  {user?.displayName || user?.email || 'Account'}
                </span>
              </button>
            );
          })()}
        </div>
      </div>

      {/* Tab bar — Main Table / Gantt */}
      <div
        className={`px-6 border-b flex items-center justify-between shrink-0 sticky top-0 z-[80] ${
          darkMode ? 'border-[#323652] bg-[#181b34]' : 'border-[#bec3d4] bg-white'
        }`}
      >
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('board')}
            className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'board'
                ? 'border-[#0073ea] text-[#0073ea]'
                : 'border-transparent text-gray-500'
            }`}
          >
            Main Table
          </button>
          <button
            onClick={() => setActiveTab('gantt')}
            className={`py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'gantt'
                ? 'border-[#0073ea] text-[#0073ea]'
                : 'border-transparent text-gray-500'
            }`}
          >
            Gantt
          </button>
        </div>
      </div>
    </>
  );
}
