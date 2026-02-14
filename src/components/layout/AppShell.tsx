// AppShell — main layout: sidebar + header + content area.
// Orchestrates workspace/board navigation and renders the active view.

import { useUIStore } from '../../stores/uiStore';
import { useProjectData } from '../../stores/projectStore';
import { useWorkspaceData } from '../../stores/workspaceStore';
import { getProjectPermissions } from '../../stores/memberStore';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import { BoardView } from '../board/BoardView';
import { GanttView } from '../gantt/GanttView';
import { UpdatesPanel } from '../panels/UpdatesPanel';
import { MembersModal } from '../panels/MembersModal';
import { SelectionTray } from '../shared/SelectionTray';
import { DatePickerPopup } from '../shared/DatePickerPopup';

export function AppShell() {
  const darkMode = useUIStore((s) => s.darkMode);
  const activeTab = useUIStore((s) => s.activeTab);
  const updatesPanelTarget = useUIStore((s) => s.updatesPanelTarget);
  const closeUpdatesPanel = useUIStore((s) => s.closeUpdatesPanel);
  const selectedItems = useUIStore((s) => s.selectedItems);

  const {
    projects,
    addProjectToWorkspace,
    updateTaskName,
    updateSubitemName,
    updateTaskDate,
    changeStatus,
    changeJobType,
    addTaskToGroup,
    addSubitem,
    addUpdate,
    addReply,
    toggleChecklistItem,
  } = useProjectData();
  const {
    workspaces,
    setWorkspaces,
    statuses,
    jobTypes,
    activeEntityId,
    activeBoardId,
    setActiveEntityId,
    setActiveBoardId,
  } = useWorkspaceData();

  // Derive active workspace
  const activeWorkspace = workspaces.find((w) => w.id === activeEntityId) || workspaces[0];
  const activeWorkspaceId = activeWorkspace?.id || '';

  // Filter boards for the active workspace
  const workspaceBoards = projects.filter((p) => p.workspaceId === activeWorkspaceId);

  // Determine active board (first in workspace if none selected)
  const effectiveBoardId = activeBoardId || workspaceBoards[0]?.id || null;
  const activeProject = effectiveBoardId
    ? projects.find((p) => p.id === effectiveBoardId)
    : null;

  // Handlers
  const handleCreateWorkspace = () => {
    const id = `w${Date.now()}`;
    setWorkspaces((prev) => [...prev, { id, name: 'New Workspace', type: 'workspace' as const }]);
    setActiveEntityId(id);
  };

  const handleCreateBoard = () => {
    if (!activeWorkspace) return;
    const pid = addProjectToWorkspace(activeWorkspace.id, activeWorkspace.name);
    setActiveBoardId(pid);
  };

  const handleUpdateEntityName = (name: string) => {
    if (!activeWorkspace) return;
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === activeWorkspace.id ? { ...w, name } : w)),
    );
  };

  return (
    <div
      className={`h-screen flex overflow-hidden ${
        darkMode ? 'bg-[#181b34] text-gray-200' : 'bg-[#eceff8] text-[#323338]'
      }`}
    >
      {/* Sidebar */}
      <Sidebar
        workspaces={workspaces}
        selectedWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={(id) => {
          setActiveEntityId(id);
          setActiveBoardId(null);
        }}
        boards={workspaceBoards}
        activeBoardId={effectiveBoardId}
        onSelectBoard={(id) => setActiveBoardId(id)}
        onCreateWorkspace={handleCreateWorkspace}
        onCreateBoard={handleCreateBoard}
        canCreateBoard={!!activeWorkspaceId}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <AppHeader
          entityName={activeWorkspace?.name || 'Flow'}
          entityType="workspace"
          onUpdateEntityName={handleUpdateEntityName}
          canEditEntityName={true}
          activeProjectId={activeProject?.id ?? null}
        />

        {/* View content */}
        {activeProject ? (
          activeTab === 'board' ? (
            <BoardView project={activeProject} />
          ) : (
            <GanttView
              project={activeProject}
              statuses={statuses}
              jobTypes={jobTypes}
              canEdit={true}
              onUpdateTaskDate={(pid, tid, sid, start, dur) =>
                updateTaskDate(pid, tid, sid, start, dur)
              }
              onUpdateTaskName={(pid, tid, v) => updateTaskName(pid, tid, v)}
              onUpdateSubitemName={(pid, tid, sid, v) =>
                updateSubitemName(pid, tid, sid, v)
              }
              onChangeStatus={(pid, tid, sid, val) => changeStatus(pid, tid, sid, val)}
              onChangeJobType={(pid, tid, sid, val) => changeJobType(pid, tid, sid, val)}
              onAddTaskToGroup={(pid, gid) => addTaskToGroup(pid, gid)}
              onAddSubitem={(pid, tid) => addSubitem(pid, tid)}
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                No board selected
              </p>
              <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Select a board from the sidebar or create a new one.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Updates Panel (slide-over) */}
      {updatesPanelTarget && activeProject && (() => {
        const { taskId, subitemId, projectId } = updatesPanelTarget;
        const task = activeProject.tasks.find((t) => t.id === taskId);
        if (!task) return null;
        const isSubitem = Boolean(subitemId);
        const subitem = subitemId ? task.subitems.find((s) => s.id === subitemId) : null;
        const targetName = isSubitem ? (subitem?.name || '') : task.name;
        const updates = isSubitem ? (subitem?.updates || []) : (task.updates || []);
        const files = isSubitem ? (subitem?.files || []) : (task.files || []);
        const permissions = getProjectPermissions(projectId);

        return (
          <UpdatesPanel
            taskName={targetName}
            parentName={isSubitem ? task.name : undefined}
            isSubitem={isSubitem}
            updates={updates}
            files={files}
            permissions={permissions}
            onClose={closeUpdatesPanel}
            onAddUpdate={(payload) => {
              const update = {
                id: `u${Date.now()}`,
                text: payload.text,
                checklist: payload.checklist,
                author: 'You',
                createdAt: new Date().toISOString(),
                replies: [],
              };
              addUpdate(projectId, taskId, subitemId, update);
            }}
            onAddReply={(updateId, text) => {
              const reply = {
                id: `r${Date.now()}`,
                text,
                author: 'You',
                createdAt: new Date().toISOString(),
              };
              addReply(projectId, taskId, subitemId, updateId, reply);
            }}
            onToggleChecklistItem={(updateId, itemId) => {
              toggleChecklistItem(projectId, taskId, subitemId, updateId, itemId);
            }}
          />
        );
      })()}

      {/* Members Modal */}
      {activeProject && (
        <MembersModal
          projectId={activeProject.id}
          projectName={activeProject.name}
        />
      )}

      {/* Selection Tray */}
      {activeProject && selectedItems.size > 0 && (
        <SelectionTray projectId={activeProject.id} />
      )}

      {/* Date Picker Popup */}
      <DatePickerPopup />
    </div>
  );
}
