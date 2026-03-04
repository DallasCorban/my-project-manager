// Sidebar — context switcher, workspace selector, board list, theme toggle.
// Supports personal context (user workspaces) and org context (shared workspaces).

import { useState } from 'react';
import { Plus, LayoutGrid, Moon, Sun, ChevronDown, ChevronLeft, Layers, Users, User, UserPlus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { Workspace } from '../../types/workspace';
import type { Board } from '../../types/board';
import type { Organization } from '../../types/org';
import type { OrgWorkspace } from '../../services/firebase/orgSync';

interface SidebarProps {
  // Context
  activeContext: string; // 'personal' or orgId
  userOrgs: Organization[];
  onSelectContext: (ctx: string) => void;
  onCreateOrg: () => void;

  // Workspaces (personal or org)
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  orgWorkspaces: OrgWorkspace[];
  selectedOrgWorkspaceId: string | null;
  onSelectOrgWorkspace: (id: string) => void;
  onCreateOrgWorkspace: () => void;

  // Boards
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateWorkspace: () => void;
  onCreateBoard: () => void;
  canCreateBoard: boolean;
  onOpenOrgMembers?: () => void;
}

export function Sidebar({
  activeContext,
  userOrgs,
  onSelectContext,
  onCreateOrg,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  orgWorkspaces,
  selectedOrgWorkspaceId,
  onSelectOrgWorkspace,
  onCreateOrgWorkspace,
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateWorkspace,
  onCreateBoard,
  canCreateBoard,
  onOpenOrgMembers,
}: SidebarProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);

  const isPersonal = activeContext === 'personal';
  const activeOrg = userOrgs.find((o) => o.id === activeContext);
  const activeWorkspace = workspaces.find((ws) => ws.id === selectedWorkspaceId);

  // Context display
  const contextName = isPersonal ? 'My Boards' : (activeOrg?.name || 'Team');
  const contextInitial = isPersonal ? 'M' : (activeOrg?.name || 'T')[0].toUpperCase();

  if (isCollapsed) {
    return (
      <div
        className={`w-12 border-r flex flex-col items-center py-4 shrink-0 hidden md:flex ${
          darkMode ? 'bg-[#111322] border-[#323652]' : 'bg-[#f7f7f9] border-[#bec3d4]'
        }`}
      >
        <button
          onClick={() => setIsCollapsed(false)}
          className={`p-2 rounded-lg transition-colors mb-4 ${
            darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
          }`}
          title="Expand sidebar"
        >
          <Layers size={18} />
        </button>

        {/* Collapsed board icons */}
        <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto">
          {boards.map((board) => (
            <button
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-colors ${
                activeBoardId === board.id
                  ? 'bg-blue-600 text-white'
                  : darkMode
                    ? 'hover:bg-white/10 text-gray-400'
                    : 'hover:bg-gray-200 text-gray-600'
              }`}
              title={board.name}
            >
              {(board.name || 'U')[0].toUpperCase()}
            </button>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleDarkMode}
          className={`p-2 rounded-lg mt-2 ${
            darkMode ? 'text-yellow-400 hover:bg-white/10' : 'text-gray-500 hover:bg-gray-200'
          }`}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-60 border-r flex flex-col hidden md:flex shrink-0 transition-all ${
        darkMode ? 'bg-[#111322] border-[#323652]' : 'bg-[#f7f7f9] border-[#bec3d4]'
      }`}
    >
      {/* Context switcher header */}
      <div className={`px-4 py-3 border-b ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'}`}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowContextMenu(!showContextMenu)}
            className="flex items-center gap-2 min-w-0 flex-1"
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              isPersonal
                ? darkMode ? 'bg-emerald-600/20 text-emerald-400' : 'bg-emerald-100 text-emerald-600'
                : darkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-600'
            }`}>
              {isPersonal ? <User size={14} /> : contextInitial}
            </div>
            <span className={`font-semibold text-sm truncate ${
              darkMode ? 'text-gray-200' : 'text-gray-800'
            }`}>
              {contextName}
            </span>
            <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${showContextMenu ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
            }`}
            title="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Context dropdown */}
        {showContextMenu && (
          <div className={`mt-2 rounded-lg border overflow-hidden ${
            darkMode ? 'bg-[#1c213e] border-[#323652]' : 'bg-white border-gray-300'
          }`}>
            {/* Personal */}
            <div
              onClick={() => { onSelectContext('personal'); setShowContextMenu(false); }}
              className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                isPersonal
                  ? darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                  : darkMode ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              <User size={12} /> My Boards
            </div>

            {/* Org list */}
            {userOrgs.map((org) => (
              <div
                key={org.id}
                onClick={() => { onSelectContext(org.id); setShowContextMenu(false); }}
                className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                  activeContext === org.id
                    ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                    : darkMode ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Users size={12} /> {org.name}
              </div>
            ))}

            {/* Create team */}
            <div
              onClick={() => { onCreateOrg(); setShowContextMenu(false); }}
              className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-1.5 border-t transition-colors ${
                darkMode
                  ? 'border-[#323652] text-gray-400 hover:bg-white/5'
                  : 'border-gray-100 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Plus size={12} /> Create Team
            </div>
          </div>
        )}
      </div>

      {/* Workspace selector (personal context only) */}
      {isPersonal && (
        <div className={`px-4 py-2 border-b ${darkMode ? 'border-[#323652]/50' : 'border-[#bec3d4]/50'}`}>
          <button
            onClick={() => setShowWorkspaces(!showWorkspaces)}
            className={`flex items-center gap-1.5 text-xs w-full ${
              darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="truncate">{activeWorkspace?.name || 'Workspace'}</span>
            <ChevronDown size={12} className={`shrink-0 transition-transform ${showWorkspaces ? 'rotate-180' : ''}`} />
          </button>
          {showWorkspaces && (
            <div className={`mt-1.5 rounded-lg border overflow-hidden ${
              darkMode ? 'bg-[#1c213e] border-[#323652]' : 'bg-white border-gray-300'
            }`}>
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  onClick={() => { onSelectWorkspace(ws.id); setShowWorkspaces(false); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                    ws.id === selectedWorkspaceId
                      ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                      : darkMode ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {ws.name}
                </div>
              ))}
              <div
                onClick={() => { onCreateWorkspace(); setShowWorkspaces(false); }}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 border-t transition-colors ${
                  darkMode
                    ? 'border-[#323652] text-gray-400 hover:bg-white/5'
                    : 'border-gray-100 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Plus size={10} /> New Workspace
              </div>
            </div>
          )}
        </div>
      )}

      {/* Org workspace selector (org context) */}
      {!isPersonal && (
        <div className={`px-4 py-2 border-b ${darkMode ? 'border-[#323652]/50' : 'border-[#bec3d4]/50'}`}>
          <button
            onClick={() => setShowWorkspaces(!showWorkspaces)}
            className={`flex items-center gap-1.5 text-xs w-full ${
              darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="truncate">
              {orgWorkspaces.find((w) => w.id === selectedOrgWorkspaceId)?.name || 'Workspace'}
            </span>
            <ChevronDown size={12} className={`shrink-0 transition-transform ${showWorkspaces ? 'rotate-180' : ''}`} />
          </button>
          {showWorkspaces && (
            <div className={`mt-1.5 rounded-lg border overflow-hidden ${
              darkMode ? 'bg-[#1c213e] border-[#323652]' : 'bg-white border-gray-300'
            }`}>
              {orgWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  onClick={() => { onSelectOrgWorkspace(ws.id); setShowWorkspaces(false); }}
                  className={`px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                    ws.id === selectedOrgWorkspaceId
                      ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                      : darkMode ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {ws.name}
                </div>
              ))}
              <div
                onClick={() => { onCreateOrgWorkspace(); setShowWorkspaces(false); }}
                className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 border-t transition-colors ${
                  darkMode
                    ? 'border-[#323652] text-gray-400 hover:bg-white/5'
                    : 'border-gray-100 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Plus size={10} /> New Workspace
              </div>
            </div>
          )}
        </div>
      )}

      {/* Board list */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${
            darkMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            Boards
          </span>
        </div>
        <div className="space-y-0.5">
          {boards.map((board) => (
            <div
              key={board.id}
              onClick={() => onSelectBoard(board.id)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                activeBoardId === board.id
                  ? darkMode
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-blue-50 text-blue-700'
                  : darkMode
                    ? 'hover:bg-white/5 text-gray-400'
                    : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <LayoutGrid size={15} className="shrink-0 opacity-60" />
              <span className="truncate font-medium">{board.name || 'Untitled Board'}</span>
            </div>
          ))}
          {boards.length === 0 && (
            <div className={`px-3 py-3 text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              No boards yet
            </div>
          )}
        </div>

        {/* New Board button */}
        {canCreateBoard && (
          <button
            onClick={onCreateBoard}
            className={`w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-lg text-xs transition-colors ${
              darkMode
                ? 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
            }`}
          >
            <Plus size={14} />
            <span>New Board</span>
          </button>
        )}
      </div>

      {/* Org members button (org context only) */}
      {!isPersonal && onOpenOrgMembers && (
        <button
          onClick={onOpenOrgMembers}
          className={`mx-2 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
            darkMode
              ? 'text-gray-400 hover:bg-white/5 hover:text-gray-300'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-600'
          }`}
        >
          <UserPlus size={14} />
          <span>Manage Members</span>
        </button>
      )}

      {/* Footer — theme toggle + app name */}
      <div
        className={`px-4 py-3 border-t flex items-center justify-between ${
          darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'
        }`}
      >
        <span className={`text-xs font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Flow
        </span>
        <button
          onClick={toggleDarkMode}
          className={`p-1.5 rounded-lg transition-colors ${
            darkMode ? 'bg-[#323652] text-yellow-400 hover:bg-[#3a3b44]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </div>
  );
}
