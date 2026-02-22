// Sidebar — workspace selector, board list, theme toggle.
// Clean visual hierarchy with workspace name prominent and collapsible design.

import { useState } from 'react';
import { Plus, LayoutGrid, Moon, Sun, ChevronDown, ChevronLeft, Layers } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import type { Workspace } from '../../types/workspace';
import type { Board } from '../../types/board';

interface SidebarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  boards: Board[];
  activeBoardId: string | null;
  onSelectBoard: (id: string) => void;
  onCreateWorkspace: () => void;
  onCreateBoard: () => void;
  canCreateBoard: boolean;
}

export function Sidebar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  boards,
  activeBoardId,
  onSelectBoard,
  onCreateWorkspace,
  onCreateBoard,
  canCreateBoard,
}: SidebarProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);

  const activeWorkspace = workspaces.find((ws) => ws.id === selectedWorkspaceId);

  if (isCollapsed) {
    return (
      <div
        className={`w-12 border-r flex flex-col items-center py-4 shrink-0 hidden md:flex ${
          darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-[#f7f7f9] border-[#d0d4e4]'
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
        darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-[#f7f7f9] border-[#d0d4e4]'
      }`}
    >
      {/* Workspace header */}
      <div className={`px-4 py-3 border-b ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowWorkspaces(!showWorkspaces)}
            className="flex items-center gap-2 min-w-0 flex-1"
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
              darkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-600'
            }`}>
              {(activeWorkspace?.name || 'W')[0].toUpperCase()}
            </div>
            <span className={`font-semibold text-sm truncate ${
              darkMode ? 'text-gray-200' : 'text-gray-800'
            }`}>
              {activeWorkspace?.name || 'Workspace'}
            </span>
            <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${showWorkspaces ? 'rotate-180' : ''}`} />
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

        {/* Workspace dropdown */}
        {showWorkspaces && (
          <div className={`mt-2 rounded-lg border overflow-hidden ${
            darkMode ? 'bg-[#1c213e] border-[#2b2c32]' : 'bg-white border-gray-200'
          }`}>
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => {
                  onSelectWorkspace(ws.id);
                  setShowWorkspaces(false);
                }}
                className={`px-3 py-2 text-xs cursor-pointer transition-colors ${
                  ws.id === selectedWorkspaceId
                    ? darkMode
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-blue-50 text-blue-600'
                    : darkMode
                      ? 'hover:bg-white/5 text-gray-300'
                      : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                {ws.name}
              </div>
            ))}
            <div
              onClick={() => {
                onCreateWorkspace();
                setShowWorkspaces(false);
              }}
              className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-1.5 border-t transition-colors ${
                darkMode
                  ? 'border-[#2b2c32] text-gray-400 hover:bg-white/5'
                  : 'border-gray-100 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Plus size={12} /> New Workspace
            </div>
          </div>
        )}
      </div>

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

      {/* Footer — theme toggle + app name */}
      <div
        className={`px-4 py-3 border-t flex items-center justify-between ${
          darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'
        }`}
      >
        <span className={`text-xs font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Flow
        </span>
        <button
          onClick={toggleDarkMode}
          className={`p-1.5 rounded-lg transition-colors ${
            darkMode ? 'bg-[#2b2c32] text-yellow-400 hover:bg-[#3a3b44]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </div>
  );
}
