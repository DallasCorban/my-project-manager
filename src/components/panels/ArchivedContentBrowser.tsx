import { useEffect, useState } from 'react';
import { ChevronLeft, FolderOpen, LayoutGrid, Users } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import {
  subscribeToOrgWorkspaces,
  subscribeToOrgBoardRefs,
  type OrgWorkspace,
  type OrgBoardRef,
} from '../../services/firebase/orgSync';
import type { Organization } from '../../types/org';
import type { Board } from '../../types/board';

interface ArchivedContentBrowserProps {
  preview: {
    type: 'org' | 'workspace' | 'board';
    id: string;
    orgId?: string;
  };
  /** All archived boards from the project store (for personal workspace drill-down). */
  allArchivedBoards: Board[];
  /** Archived orgs list (to get the org name). */
  archivedOrgs: Organization[];
  onSelectBoard: (boardId: string) => void;
  onBack: () => void;
}

export default function ArchivedContentBrowser({
  preview,
  allArchivedBoards,
  archivedOrgs,
  onSelectBoard,
  onBack,
}: ArchivedContentBrowserProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  // Org drill-down state
  const [workspaces, setWorkspaces] = useState<OrgWorkspace[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [boardRefs, setBoardRefs] = useState<OrgBoardRef[]>([]);

  // Load org workspaces when previewing an org
  useEffect(() => {
    if (preview.type !== 'org') return;
    setSelectedWsId(null);
    setBoardRefs([]);
    const unsub = subscribeToOrgWorkspaces(preview.id, setWorkspaces);
    return unsub;
  }, [preview.type, preview.id]);

  // Load board refs when a workspace is selected
  useEffect(() => {
    if (!selectedWsId || preview.type !== 'org') return;
    const unsub = subscribeToOrgBoardRefs(preview.id, selectedWsId, setBoardRefs);
    return unsub;
  }, [preview.type, preview.id, selectedWsId]);

  const org = archivedOrgs.find((o) => o.id === preview.id);
  const title =
    preview.type === 'org'
      ? org?.name || 'Archived Team'
      : 'Archived Workspace';

  // Personal workspace: show boards from allArchivedBoards
  const personalWsBoards =
    preview.type === 'workspace'
      ? allArchivedBoards.filter((b) => b.workspaceId === preview.id)
      : [];

  const selectedWs = workspaces.find((w) => w.id === selectedWsId);

  return (
    <div className={`flex-1 flex flex-col items-center pt-16 px-6 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => {
              if (selectedWsId) {
                setSelectedWsId(null);
                setBoardRefs([]);
              } else {
                onBack();
              }
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'
            }`}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold">{selectedWs ? selectedWs.name : title}</h2>
            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              {selectedWsId ? 'Boards in this workspace' : preview.type === 'org' ? 'Workspaces in this team' : 'Boards in this workspace'}
            </p>
          </div>
        </div>

        {/* Org: show workspaces (or boards if workspace selected) */}
        {preview.type === 'org' && !selectedWsId && (
          <div className="space-y-1">
            {workspaces.length === 0 && (
              <p className={`text-sm text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                No workspaces found
              </p>
            )}
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => setSelectedWsId(ws.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                }`}
              >
                <FolderOpen size={16} className="shrink-0 opacity-60" />
                <span className="flex-1 text-left">{ws.name}</span>
                <ChevronLeft size={14} className="rotate-180 opacity-40" />
              </button>
            ))}
          </div>
        )}

        {/* Org workspace: show board refs */}
        {preview.type === 'org' && selectedWsId && (
          <div className="space-y-1">
            {boardRefs.length === 0 && (
              <p className={`text-sm text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                No boards found
              </p>
            )}
            {boardRefs.map((ref) => (
              <button
                key={ref.id}
                onClick={() => onSelectBoard(ref.projectId)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                }`}
              >
                <LayoutGrid size={16} className="shrink-0 opacity-60" />
                <span className="flex-1 text-left">Board</span>
                <ChevronLeft size={14} className="rotate-180 opacity-40" />
              </button>
            ))}
          </div>
        )}

        {/* Personal workspace: show archived boards */}
        {preview.type === 'workspace' && (
          <div className="space-y-1">
            {personalWsBoards.length === 0 && (
              <p className={`text-sm text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                No boards found
              </p>
            )}
            {personalWsBoards.map((board) => (
              <button
                key={board.id}
                onClick={() => onSelectBoard(board.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                }`}
              >
                <LayoutGrid size={16} className="shrink-0 opacity-60" />
                <span className="flex-1 text-left">{board.name || 'Untitled Board'}</span>
                <ChevronLeft size={14} className="rotate-180 opacity-40" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
