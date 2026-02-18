// AppShell — main layout: sidebar + header + content area.
// Orchestrates workspace/board navigation and renders the active view.

import { useEffect, useRef } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useProjectContext } from '../../stores/projectStore';
import { useWorkspaceContext } from '../../stores/workspaceStore';
import {
  getProjectPermissions,
  ensureProject,
  startProjectMembershipListeners,
  stopProjectMembershipListeners,
  startMembershipDiscovery,
  stopMembershipDiscovery,
} from '../../stores/memberStore';
import { useMemberStore } from '../../stores/memberStore';
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
  } = useProjectContext();
  const {
    workspaces,
    setWorkspaces,
    statuses,
    jobTypes,
    activeEntityId,
    activeBoardId,
    setActiveEntityId,
    setActiveBoardId,
  } = useWorkspaceContext();

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

  const user = useAuthStore((s) => s.user);

  // ── Membership lifecycle ────────────────────────────────────────────

  // Start membership discovery when the user logs in (finds all projects
  // the user belongs to). Clean up on logout or unmount.
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    startMembershipDiscovery();
    return () => stopMembershipDiscovery();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the active project changes:
  //  1. Ensure the project exists in Firestore (creates owner membership)
  //  2. Start membership listeners (loads members list + self-membership)
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    const pid = activeProject?.id ?? null;
    if (pid === prevProjectIdRef.current) return;

    // Stop listeners for previous project
    if (prevProjectIdRef.current) {
      stopProjectMembershipListeners(prevProjectIdRef.current);
    }
    prevProjectIdRef.current = pid;

    if (!pid || !activeProject || !user || user.isAnonymous) return;

    // Ensure project metadata + owner membership in Firestore
    void ensureProject(pid, activeProject);

    // Start real-time listeners for members
    startProjectMembershipListeners(pid);

    return () => stopProjectMembershipListeners(pid);
  }, [activeProject?.id, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute permissions for active project (reactive — updates when
  // selfMembershipByProject changes after listeners load).
  // We use a sentinel to distinguish "not yet loaded" (undefined) from
  // "loaded but no membership" (null).
  const MEMBERSHIP_NOT_LOADED = undefined;
  const selfMembership = useMemberStore((s) => {
    if (!activeProject?.id) return MEMBERSHIP_NOT_LOADED;
    const map = s.selfMembershipByProject;
    return activeProject.id in map ? (map[activeProject.id] ?? null) : MEMBERSHIP_NOT_LOADED;
  });
  const membershipLoaded = selfMembership !== MEMBERSHIP_NOT_LOADED;
  const projectPermissions = activeProject?.id
    ? getProjectPermissions(activeProject.id)
    : null;
  // Allow edits if:
  //  - membership is loaded and permissions allow it, OR
  //  - membership hasn't loaded yet but user is logged in (graceful default
  //    so the creator isn't locked out while Firestore confirms ownership)
  const canEdit = membershipLoaded
    ? (projectPermissions?.canEdit ?? false)
    : (!!user && !user.isAnonymous && !!activeProject);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleCreateWorkspace = () => {
    const id = `w${Date.now()}`;
    setWorkspaces((prev) => [...prev, { id, name: 'New Workspace', type: 'workspace' as const }]);
    setActiveEntityId(id);
  };

  const handleCreateBoard = () => {
    if (!activeWorkspace) return;
    const pid = addProjectToWorkspace(activeWorkspace.id, activeWorkspace.name);
    setActiveBoardId(pid);

    // Eagerly ensure the new project in Firestore so the owner membership
    // is created immediately (the useEffect will also catch it, but this
    // avoids any delay).
    const newProject = projects.find((p) => p.id === pid)
      ?? { id: pid, workspaceId: activeWorkspace.id, workspaceName: activeWorkspace.name, name: 'New Board', status: 'working' as const, groups: [], tasks: [] };
    void ensureProject(pid, newProject);
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
          canEditEntityName={canEdit || !activeProject}
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
              canEdit={canEdit}
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
        // Use the already-computed permissions (which gracefully default
        // to allowing edits while membership is loading).
        const permissions = projectPermissions ?? getProjectPermissions(projectId);
        const effectivePerms = !membershipLoaded && user && !user.isAnonymous
          ? { ...permissions, canEdit: true, canUpload: true, canView: true, canDownload: true }
          : permissions;

        return (
          <UpdatesPanel
            taskName={targetName}
            parentName={isSubitem ? task.name : undefined}
            isSubitem={isSubitem}
            updates={updates}
            files={files}
            permissions={effectivePerms}
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
