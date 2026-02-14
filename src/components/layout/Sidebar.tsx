// Sidebar — workspace selector, board list, theme toggle.
// Ported from App.jsx Sidebar component.

import { Plus, LayoutGrid, Moon, Sun } from 'lucide-react';
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

  return (
    <div
      className={`w-64 border-r flex flex-col hidden md:flex shrink-0 ${
        darkMode ? 'bg-[#111322] border-[#2b2c32]' : 'bg-white border-[#d0d4e4]'
      }`}
    >
      {/* Header */}
      <div className={`p-4 border-b ${darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'}`}>
        <h2 className="font-bold text-lg">Workspaces</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Workspace selector */}
        <div>
          <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
            <span>Workspaces</span>
            <Plus
              size={14}
              className="cursor-pointer hover:text-blue-500"
              onClick={onCreateWorkspace}
            />
          </div>
          {workspaces.length > 0 ? (
            <select
              value={selectedWorkspaceId || ''}
              onChange={(e) => onSelectWorkspace(e.target.value)}
              className={`w-full rounded-md border text-sm px-3 py-2 outline-none ${
                darkMode
                  ? 'bg-[#1c213e] border-[#2b2c32] text-gray-200'
                  : 'bg-white border-gray-200 text-gray-700'
              }`}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              className={`text-xs px-3 py-2 rounded-md border ${
                darkMode ? 'border-[#2b2c32] text-gray-500' : 'border-gray-200 text-gray-500'
              }`}
            >
              No workspaces yet. Click + to create one.
            </div>
          )}
        </div>

        {/* Board list */}
        <div>
          <div className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
            <span>Boards</span>
            <Plus
              size={14}
              className={
                canCreateBoard
                  ? 'cursor-pointer hover:text-blue-500'
                  : 'opacity-40 cursor-not-allowed'
              }
              onClick={() => canCreateBoard && onCreateBoard()}
            />
          </div>
          <div className="space-y-1">
            {boards.map((board) => (
              <div
                key={board.id}
                onClick={() => onSelectBoard(board.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                  activeBoardId === board.id
                    ? darkMode
                      ? 'bg-[#1c213e] text-blue-400'
                      : 'bg-blue-50 text-blue-600'
                    : darkMode
                      ? 'hover:bg-[#1c213e] text-gray-400'
                      : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <LayoutGrid size={16} />
                <span className="truncate font-medium">{board.name || 'Untitled Board'}</span>
              </div>
            ))}
            {boards.length === 0 && (
              <div className={`px-3 py-2 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                No boards in this workspace.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer — theme toggle */}
      <div
        className={`p-4 border-t ${
          darkMode ? 'border-[#2b2c32]' : 'border-[#d0d4e4]'
        } flex items-center justify-between`}
      >
        <span className="text-xs text-gray-500">Theme</span>
        <button
          onClick={toggleDarkMode}
          className={`p-2 rounded-full ${
            darkMode ? 'bg-[#2b2c32] text-yellow-400' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  );
}
