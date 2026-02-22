// App header — entity name, view tabs, settings, auth/members buttons.
// Shows user role badge and activity sidebar toggle.

import { Briefcase, LayoutDashboard, MessageCircle } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useMemberStore } from '../../stores/memberStore';
import { EditableText } from '../shared/EditableText';

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
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
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

  // Role badge colors
  const getRoleBadge = () => {
    if (!selfRole) return null;
    const roleColors: Record<string, string> = {
      owner: 'bg-purple-500/15 text-purple-500',
      admin: 'bg-blue-500/15 text-blue-500',
      member: 'bg-green-500/15 text-green-500',
      viewer: 'bg-gray-500/15 text-gray-500',
      contractor: 'bg-orange-500/15 text-orange-500',
    };
    const colorClass = roleColors[selfRole] || roleColors.member;
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
          darkMode ? 'border-[#2a2d44] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'
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
            className={`text-lg font-bold ${
              darkMode ? 'text-white' : 'text-gray-800'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Role badge */}
          {getRoleBadge()}

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

          <button
            onClick={() => setMembersModalOpen(true)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              darkMode
                ? 'bg-[#1c213e] border-[#2a2d44] text-gray-200 hover:bg-[#202336]'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            disabled={!user || user.isAnonymous}
          >
            Members
          </button>
          <button
            onClick={openAuthModal}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              darkMode
                ? 'bg-[#1c213e] border-[#2a2d44] text-gray-200 hover:bg-[#202336]'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {user
              ? user.isAnonymous
                ? 'Guest'
                : user.email || 'Account'
              : 'Account'}
          </button>
        </div>
      </div>

      {/* Tab bar — Main Table / Gantt */}
      <div
        className={`px-6 border-b flex items-center justify-between shrink-0 sticky top-0 z-[80] ${
          darkMode ? 'border-[#2a2d44] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'
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
