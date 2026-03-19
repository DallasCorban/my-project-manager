// Sidebar — context switcher, workspace selector, board list, settings, archive.
// Supports personal context (user workspaces) and org context (shared workspaces).
// Three modes: 'nav' (default), 'settings' (settings list), 'archive' (archive view).

import { useState, useRef, useEffect } from 'react';
import {
  Plus, LayoutGrid, Moon, Sun, ChevronDown, ChevronLeft, ChevronRight,
  Layers, Users, User, UserPlus, MoreHorizontal, Pencil, Archive,
  RotateCcw, Trash2, Settings, ArrowLeft, FolderOpen,
} from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { Workspace } from '../../types/workspace';
import type { Board } from '../../types/board';
import type { Organization } from '../../types/org';
import type { OrgWorkspace } from '../../services/firebase/orgSync';

type SidebarMode = 'nav' | 'settings' | 'archive';

interface SidebarProps {
  // Context
  activeContext: string;
  userOrgs: Organization[];
  onSelectContext: (ctx: string) => void;
  onCreateOrg: () => void;

  // Workspaces (personal or org)
  workspaces: Workspace[];
  archivedWorkspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  orgWorkspaces: OrgWorkspace[];
  selectedOrgWorkspaceId: string | null;
  onSelectOrgWorkspace: (id: string) => void;
  onCreateOrgWorkspace: () => void;

  // Boards
  boards: Board[];
  allArchivedBoards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateWorkspace: () => void;
  onCreateBoard: () => void;
  canCreateBoard: boolean;
  onOpenOrgMembers?: () => void;

  // Board actions
  onRenameBoard: (id: string, name: string) => void;
  onArchiveBoard: (id: string) => void;
  onRestoreBoard: (id: string) => void;
  onDeleteBoard: (id: string) => void;

  // Workspace actions
  onRenameWorkspace: (id: string, name: string) => void;
  onArchiveWorkspace: (id: string) => void;
  onRestoreWorkspace: (id: string) => void;
  onDeleteWorkspace: (id: string) => void;

  // Org actions
  onRenameOrg: (id: string, name: string) => void;
  onArchiveOrg: (id: string) => void;
}

export function Sidebar({
  activeContext,
  userOrgs,
  onSelectContext,
  onCreateOrg,
  workspaces,
  archivedWorkspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  orgWorkspaces,
  selectedOrgWorkspaceId,
  onSelectOrgWorkspace,
  onCreateOrgWorkspace,
  boards,
  allArchivedBoards,
  activeBoardId,
  onSelectBoard,
  onCreateWorkspace,
  onCreateBoard,
  canCreateBoard,
  onOpenOrgMembers,
  onRenameBoard,
  onArchiveBoard,
  onRestoreBoard,
  onDeleteBoard,
  onRenameWorkspace,
  onArchiveWorkspace,
  onRestoreWorkspace,
  onDeleteWorkspace,
  onRenameOrg,
  onArchiveOrg,
}: SidebarProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('nav');

  // Board action menu state
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Inline rename state
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Workspace action menu state
  const [wsMenuId, setWsMenuId] = useState<string | null>(null);
  const wsMenuRef = useRef<HTMLDivElement>(null);
  const [renamingWsId, setRenamingWsId] = useState<string | null>(null);
  const [renameWsValue, setRenameWsValue] = useState('');
  const renameWsInputRef = useRef<HTMLInputElement>(null);

  // Org action menu state
  const [orgMenuId, setOrgMenuId] = useState<string | null>(null);
  const orgMenuRef = useRef<HTMLDivElement>(null);
  const [renamingOrgId, setRenamingOrgId] = useState<string | null>(null);
  const [renameOrgValue, setRenameOrgValue] = useState('');
  const renameOrgInputRef = useRef<HTMLInputElement>(null);

  // Archive view: expanded workspace IDs
  const [expandedArchivedWs, setExpandedArchivedWs] = useState<Set<string>>(new Set());

  const isPersonal = activeContext === 'personal';
  const activeOrg = userOrgs.find((o) => o.id === activeContext);
  const activeWorkspace = workspaces.find((ws) => ws.id === selectedWorkspaceId);

  const contextName = isPersonal ? 'My Boards' : (activeOrg?.name || 'Team');
  const contextInitial = isPersonal ? 'M' : (activeOrg?.name || 'T')[0].toUpperCase();

  // Archived workspace IDs for filtering
  const archivedWsIds = new Set(archivedWorkspaces.map((w) => w.id));

  // Individually archived boards: board is archived but its workspace is NOT archived
  const individuallyArchivedBoards = allArchivedBoards.filter((b) => !archivedWsIds.has(b.workspaceId));

  // Total archive count for badge
  const archiveCount = archivedWorkspaces.length + individuallyArchivedBoards.length;

  // Close board menu on outside click
  useEffect(() => {
    if (!menuBoardId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuBoardId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuBoardId]);

  // Focus rename input
  useEffect(() => {
    if (renamingBoardId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingBoardId]);

  // Close workspace menu on outside click
  useEffect(() => {
    if (!wsMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) {
        setWsMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [wsMenuId]);

  // Focus workspace rename input
  useEffect(() => {
    if (renamingWsId && renameWsInputRef.current) {
      renameWsInputRef.current.focus();
      renameWsInputRef.current.select();
    }
  }, [renamingWsId]);

  // Close org menu on outside click
  useEffect(() => {
    if (!orgMenuId) return;
    const handleClick = (e: MouseEvent) => {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) {
        setOrgMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [orgMenuId]);

  // Focus org rename input
  useEffect(() => {
    if (renamingOrgId && renameOrgInputRef.current) {
      renameOrgInputRef.current.focus();
      renameOrgInputRef.current.select();
    }
  }, [renamingOrgId]);

  const startRename = (board: Board) => {
    setRenamingBoardId(board.id);
    setRenameValue(board.name || '');
    setMenuBoardId(null);
  };

  const commitRename = () => {
    if (renamingBoardId && renameValue.trim()) {
      onRenameBoard(renamingBoardId, renameValue.trim());
    }
    setRenamingBoardId(null);
  };

  const handleArchiveBoardMenu = (boardId: string) => {
    setMenuBoardId(null);
    onArchiveBoard(boardId);
  };

  const startWsRename = (ws: Workspace) => {
    setRenamingWsId(ws.id);
    setRenameWsValue(ws.name || '');
    setWsMenuId(null);
  };

  const commitWsRename = () => {
    if (renamingWsId && renameWsValue.trim()) {
      onRenameWorkspace(renamingWsId, renameWsValue.trim());
    }
    setRenamingWsId(null);
  };

  const handleArchiveWsMenu = (wsId: string) => {
    setWsMenuId(null);
    setShowWorkspaces(false);
    onArchiveWorkspace(wsId);
  };

  const startOrgRename = (org: Organization) => {
    setRenamingOrgId(org.id);
    setRenameOrgValue(org.name || '');
    setOrgMenuId(null);
  };

  const commitOrgRename = () => {
    if (renamingOrgId && renameOrgValue.trim()) {
      onRenameOrg(renamingOrgId, renameOrgValue.trim());
    }
    setRenamingOrgId(null);
  };

  const handleArchiveOrgMenu = (orgId: string) => {
    setOrgMenuId(null);
    setShowContextMenu(false);
    onArchiveOrg(orgId);
  };

  const toggleArchivedWsExpand = (wsId: string) => {
    setExpandedArchivedWs((prev) => {
      const next = new Set(prev);
      if (next.has(wsId)) next.delete(wsId);
      else next.add(wsId);
      return next;
    });
  };

  // ── Collapsed view ──────────────────────────────────────────────────
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

  // ── Shared footer ───────────────────────────────────────────────────
  const footer = (
    <div
      className={`px-4 py-3 border-t flex items-center justify-between ${
        darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'
      }`}
    >
      <span className={`text-xs font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
        Flow
      </span>
      <div className="flex items-center gap-1">
        {sidebarMode === 'nav' && (
          <button
            onClick={() => setSidebarMode('settings')}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'text-gray-500 hover:bg-white/10 hover:text-gray-400' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-500'
            }`}
            title="Settings"
          >
            <Settings size={14} />
          </button>
        )}
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

  // ── Settings view ───────────────────────────────────────────────────
  if (sidebarMode === 'settings') {
    return (
      <div className={`w-60 border-r flex flex-col hidden md:flex shrink-0 ${
        darkMode ? 'bg-[#111322] border-[#323652]' : 'bg-[#f7f7f9] border-[#bec3d4]'
      }`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center gap-2 ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'}`}>
          <button
            onClick={() => setSidebarMode('nav')}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
            }`}
          >
            <ArrowLeft size={16} />
          </button>
          <span className={`font-semibold text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Settings
          </span>
        </div>

        {/* Settings list */}
        <div className="flex-1 overflow-y-auto p-2">
          <button
            onClick={() => setSidebarMode('archive')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Archive size={16} className="shrink-0 opacity-60" />
            <span className="flex-1 text-left">Archive</span>
            {archiveCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'
              }`}>
                {archiveCount}
              </span>
            )}
            <ChevronRight size={14} className="opacity-40" />
          </button>
        </div>

        {footer}
      </div>
    );
  }

  // ── Archive view ────────────────────────────────────────────────────
  if (sidebarMode === 'archive') {
    return (
      <div className={`w-60 border-r flex flex-col hidden md:flex shrink-0 ${
        darkMode ? 'bg-[#111322] border-[#323652]' : 'bg-[#f7f7f9] border-[#bec3d4]'
      }`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b flex items-center gap-2 ${darkMode ? 'border-[#323652]' : 'border-[#bec3d4]'}`}>
          <button
            onClick={() => setSidebarMode('settings')}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
            }`}
          >
            <ArrowLeft size={16} />
          </button>
          <Archive size={16} className={darkMode ? 'text-gray-400' : 'text-gray-500'} />
          <span className={`font-semibold text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            Archive
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {archiveCount === 0 && (
            <div className={`px-3 py-6 text-xs text-center ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
              No archived items
            </div>
          )}

          {/* Section 1: Archived Workspaces */}
          {archivedWorkspaces.length > 0 && (
            <div className="mb-3">
              <div className={`px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`}>
                Workspaces
              </div>
              <div className="space-y-0.5">
                {archivedWorkspaces.map((ws) => {
                  const wsBoards = allArchivedBoards.filter((b) => b.workspaceId === ws.id);
                  const isExpanded = expandedArchivedWs.has(ws.id);
                  return (
                    <div key={ws.id}>
                      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                        darkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {/* Expand toggle */}
                        <button
                          onClick={() => toggleArchivedWsExpand(ws.id)}
                          className="shrink-0 p-0.5"
                        >
                          {wsBoards.length > 0 ? (
                            <ChevronDown size={12} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                          ) : (
                            <FolderOpen size={12} className="opacity-40" />
                          )}
                        </button>
                        <span className="truncate flex-1 font-medium">{ws.name}</span>
                        <button
                          onClick={() => onRestoreWorkspace(ws.id)}
                          title="Restore workspace & boards"
                          className={`p-0.5 rounded transition-colors ${
                            darkMode ? 'hover:bg-white/10 text-gray-500 hover:text-green-400' : 'hover:bg-gray-100 text-gray-400 hover:text-green-600'
                          }`}
                        >
                          <RotateCcw size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Permanently delete "${ws.name}" and all its boards?`)) {
                              onDeleteWorkspace(ws.id);
                            }
                          }}
                          title="Delete permanently"
                          className={`p-0.5 rounded transition-colors ${
                            darkMode ? 'hover:bg-white/10 text-gray-500 hover:text-red-400' : 'hover:bg-gray-100 text-gray-400 hover:text-red-500'
                          }`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {/* Expanded boards */}
                      {isExpanded && wsBoards.length > 0 && (
                        <div className="ml-5 space-y-0.5">
                          {wsBoards.map((board) => (
                            <div
                              key={board.id}
                              className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] ${
                                darkMode ? 'text-gray-600' : 'text-gray-400'
                              }`}
                            >
                              <LayoutGrid size={11} className="shrink-0 opacity-40" />
                              <span className="truncate flex-1">{board.name || 'Untitled'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Individually Archived Boards */}
          {individuallyArchivedBoards.length > 0 && (
            <div>
              <div className={`px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                darkMode ? 'text-gray-500' : 'text-gray-400'
              }`}>
                Boards
              </div>
              <div className="space-y-0.5">
                {individuallyArchivedBoards.map((board) => (
                  <div
                    key={board.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                      darkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    <LayoutGrid size={13} className="shrink-0 opacity-40" />
                    <span className="truncate flex-1">{board.name || 'Untitled'}</span>
                    <button
                      onClick={() => onRestoreBoard(board.id)}
                      title="Restore"
                      className={`p-0.5 rounded transition-colors ${
                        darkMode ? 'hover:bg-white/10 text-gray-500 hover:text-green-400' : 'hover:bg-gray-100 text-gray-400 hover:text-green-600'
                      }`}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Permanently delete this board?')) {
                          onDeleteBoard(board.id);
                        }
                      }}
                      title="Delete permanently"
                      className={`p-0.5 rounded transition-colors ${
                        darkMode ? 'hover:bg-white/10 text-gray-500 hover:text-red-400' : 'hover:bg-gray-100 text-gray-400 hover:text-red-500'
                      }`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {footer}
      </div>
    );
  }

  // ── Nav view (default) ──────────────────────────────────────────────
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
            {userOrgs.map((org) => (
              <div
                key={org.id}
                className={`group/org relative flex items-center px-3 py-2 text-xs transition-colors ${
                  activeContext === org.id
                    ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                    : darkMode ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <Users size={12} className="shrink-0 mr-2" />
                {renamingOrgId === org.id ? (
                  <input
                    ref={renameOrgInputRef}
                    value={renameOrgValue}
                    onChange={(e) => setRenameOrgValue(e.target.value)}
                    onBlur={commitOrgRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitOrgRename();
                      if (e.key === 'Escape') setRenamingOrgId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className={`flex-1 min-w-0 bg-transparent border-b text-xs outline-none ${
                      darkMode ? 'border-blue-500 text-gray-200' : 'border-blue-500 text-gray-800'
                    }`}
                  />
                ) : (
                  <>
                    <span
                      className="flex-1 cursor-pointer truncate"
                      onClick={() => { onSelectContext(org.id); setShowContextMenu(false); }}
                    >
                      {org.name}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOrgMenuId(orgMenuId === org.id ? null : org.id); }}
                      className={`shrink-0 p-0.5 rounded opacity-0 group-hover/org:opacity-100 transition-opacity ${
                        darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                      }`}
                    >
                      <MoreHorizontal size={12} />
                    </button>
                  </>
                )}
                {orgMenuId === org.id && (
                  <div
                    ref={orgMenuRef}
                    className={`absolute right-1 top-full mt-0.5 z-50 rounded-lg border shadow-lg overflow-hidden min-w-[120px] ${
                      darkMode ? 'bg-[#1c213e] border-[#323652]' : 'bg-white border-gray-200'
                    }`}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); startOrgRename(org); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                        darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Pencil size={11} /> Rename
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleArchiveOrgMenu(org.id); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                        darkMode ? 'text-orange-400 hover:bg-orange-500/10' : 'text-orange-600 hover:bg-orange-50'
                      }`}
                    >
                      <Archive size={11} /> Archive
                    </button>
                  </div>
                )}
              </div>
            ))}
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

      {/* Workspace selector (personal context) */}
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
                  className={`group/ws relative flex items-center px-3 py-1.5 text-xs transition-colors ${
                    ws.id === selectedWorkspaceId
                      ? darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                      : darkMode ? 'hover:bg-white/5 text-gray-300' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  {renamingWsId === ws.id ? (
                    <input
                      ref={renameWsInputRef}
                      value={renameWsValue}
                      onChange={(e) => setRenameWsValue(e.target.value)}
                      onBlur={commitWsRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitWsRename();
                        if (e.key === 'Escape') setRenamingWsId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className={`flex-1 min-w-0 bg-transparent border-b text-xs outline-none ${
                        darkMode ? 'border-blue-500 text-gray-200' : 'border-blue-500 text-gray-800'
                      }`}
                    />
                  ) : (
                    <>
                      <span
                        className="flex-1 cursor-pointer truncate"
                        onClick={() => { onSelectWorkspace(ws.id); setShowWorkspaces(false); setWsMenuId(null); }}
                      >
                        {ws.name}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setWsMenuId(wsMenuId === ws.id ? null : ws.id); }}
                        className={`shrink-0 p-0.5 rounded opacity-0 group-hover/ws:opacity-100 transition-opacity ${
                          darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                        }`}
                      >
                        <MoreHorizontal size={12} />
                      </button>
                    </>
                  )}
                  {wsMenuId === ws.id && (
                    <div
                      ref={wsMenuRef}
                      className={`absolute right-1 top-full mt-0.5 z-50 rounded-lg border shadow-lg overflow-hidden min-w-[120px] ${
                        darkMode ? 'bg-[#1c213e] border-[#323652]' : 'bg-white border-gray-200'
                      }`}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); startWsRename(ws); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                          darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <Pencil size={11} /> Rename
                      </button>
                      {workspaces.length > 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleArchiveWsMenu(ws.id); }}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                            darkMode ? 'text-orange-400 hover:bg-orange-500/10' : 'text-orange-600 hover:bg-orange-50'
                          }`}
                        >
                          <Archive size={11} /> Archive
                        </button>
                      )}
                    </div>
                  )}
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

      {/* Org workspace selector */}
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
              className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                activeBoardId === board.id
                  ? darkMode
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-blue-50 text-blue-700'
                  : darkMode
                    ? 'hover:bg-white/5 text-gray-400'
                    : 'hover:bg-gray-100 text-gray-700'
              }`}
              onClick={() => {
                if (renamingBoardId !== board.id) onSelectBoard(board.id);
              }}
            >
              <LayoutGrid size={15} className="shrink-0 opacity-60" />

              {renamingBoardId === board.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingBoardId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`flex-1 min-w-0 bg-transparent border-b font-medium text-sm outline-none ${
                    darkMode ? 'border-blue-500 text-gray-200' : 'border-blue-500 text-gray-800'
                  }`}
                />
              ) : (
                <span className="truncate font-medium flex-1">{board.name || 'Untitled Board'}</span>
              )}

              {renamingBoardId !== board.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuBoardId(menuBoardId === board.id ? null : board.id);
                  }}
                  className={`shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                    darkMode ? 'hover:bg-white/10 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                  }`}
                >
                  <MoreHorizontal size={14} />
                </button>
              )}

              {menuBoardId === board.id && (
                <div
                  ref={menuRef}
                  className={`absolute right-1 top-full mt-0.5 z-50 rounded-lg border shadow-lg overflow-hidden min-w-[140px] ${
                    darkMode ? 'bg-[#1c213e] border-[#323652]' : 'bg-white border-gray-200'
                  }`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); startRename(board); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      darkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Pencil size={12} /> Rename
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleArchiveBoardMenu(board.id); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      darkMode ? 'text-orange-400 hover:bg-orange-500/10' : 'text-orange-600 hover:bg-orange-50'
                    }`}
                  >
                    <Archive size={12} /> Archive
                  </button>
                </div>
              )}
            </div>
          ))}
          {boards.length === 0 && (
            <div className={`px-3 py-3 text-xs text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              No boards yet
            </div>
          )}
        </div>

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

      {/* Org members button */}
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

      {footer}
    </div>
  );
}
