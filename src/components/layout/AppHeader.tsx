// App header — entity name, view tabs, settings, auth/members buttons.
// Ported from App.jsx AppHeader component.

import { Briefcase, LayoutDashboard } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { EditableText } from '../shared/EditableText';

interface AppHeaderProps {
  entityName: string;
  entityType: 'workspace' | 'dashboard';
  onUpdateEntityName: (name: string) => void;
  canEditEntityName: boolean;
}

export function AppHeader({
  entityName,
  entityType,
  onUpdateEntityName,
  canEditEntityName,
}: AppHeaderProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const user = useAuthStore((s) => s.user);
  const openAuthModal = useAuthStore((s) => s.openModal);
  const setMembersModalOpen = useUIStore((s) => s.setMembersModalOpen);

  return (
    <>
      {/* Top bar — entity name + auth buttons */}
      <div
        className={`h-16 border-b px-8 flex items-center justify-between shrink-0 ${
          darkMode ? 'border-[#2b2c32] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'
        }`}
      >
        <div className="flex items-center gap-3 text-2xl font-bold">
          {entityType === 'workspace' ? (
            <Briefcase className="text-gray-400" />
          ) : (
            <LayoutDashboard className="text-purple-500" />
          )}
          <EditableText
            value={entityName}
            onChange={canEditEntityName ? onUpdateEntityName : undefined}
            readOnly={!canEditEntityName}
            className={`hover:bg-opacity-10 px-2 -ml-2 rounded ${
              darkMode ? 'text-white hover:bg-white' : 'hover:bg-gray-800'
            }`}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMembersModalOpen(true)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              darkMode
                ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200 hover:bg-[#202336]'
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
                ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200 hover:bg-[#202336]'
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
        className={`px-8 border-b flex items-center justify-between shrink-0 sticky top-0 z-[80] ${
          darkMode ? 'border-[#2b2c32] bg-[#181b34]' : 'border-[#d0d4e4] bg-white'
        }`}
      >
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('board')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'board'
                ? 'border-[#0073ea] text-[#0073ea]'
                : 'border-transparent text-gray-500'
            }`}
          >
            Main Table
          </button>
          <button
            onClick={() => setActiveTab('gantt')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
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
