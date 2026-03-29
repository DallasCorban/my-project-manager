// AppShell — main layout: sidebar + header + content area.
// Orchestrates workspace/board navigation, org lifecycle, and renders the active view.

import { useEffect, useRef, useState } from 'react';
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
import {
  useOrgStore,
  startOrgDiscovery,
  stopOrgDiscovery,
  startOrgDetailListeners,
  stopOrgDetailListeners,
  startOrgBoardRefsListener,
} from '../../stores/orgStore';
import { createOrg, createOrgWorkspace, addBoardToOrgWorkspace, removeBoardFromOrgWorkspace, updateOrgName, archiveOrg, restoreOrg, deleteOrg } from '../../services/firebase/orgSync';
import { deleteProjectFromFirestore } from '../../services/firebase/projectSync';
import { canUseFirestore } from '../../services/firebase/firestore';
import { uploadFileWithProgress } from '../../services/firebase/fileSync';
import { useInviteAccept } from '../../hooks/useInviteAccept';
import { Sidebar } from './Sidebar';
import { AppHeader } from './AppHeader';
import { BoardView } from '../board/BoardView';
import { GanttView } from '../gantt/GanttView';
import { UpdatesPanel } from '../panels/UpdatesPanel';
import { AiChatPanel } from '../panels/AiChatPanel';
import { MembersModal } from '../panels/MembersModal';
import { OrgMembersModal } from '../panels/OrgMembersModal';
import { SelectionTray } from '../shared/SelectionTray';
import { EmptyNameToast } from '../shared/EmptyNameToast';
import { DatePickerPopup } from '../shared/DatePickerPopup';
import { CreateTeamModal } from '../panels/CreateTeamModal';
// ArchivedBanner and ArchivedContentBrowser available but not used — preview loads boards directly

export function AppShell() {
  const darkMode = useUIStore((s) => s.darkMode);
  const activeTab = useUIStore((s) => s.activeTab);
  const updatesPanelTarget = useUIStore((s) => s.updatesPanelTarget);
  const closeUpdatesPanel = useUIStore((s) => s.closeUpdatesPanel);
  const selectedItems = useUIStore((s) => s.selectedItems);
  const activeContext = useUIStore((s) => s.activeContext);
  const setActiveContext = useUIStore((s) => s.setActiveContext);
  const setOrgMembersModalOpen = useUIStore((s) => s.setOrgMembersModalOpen);
  const aiChatOpen = useUIStore((s) => s.aiChatOpen);
  const closeAiChat = useUIStore((s) => s.closeAiChat);

  // ── Sidebar slide animation ──────────────────────────────────────────
  const [shownTarget, setShownTarget] = useState(updatesPanelTarget);
  const isOpen = !!updatesPanelTarget || aiChatOpen;

  useEffect(() => {
    if (updatesPanelTarget) {
      setShownTarget(updatesPanelTarget);
    } else {
      const t = setTimeout(() => setShownTarget(null), 300);
      return () => clearTimeout(t);
    }
  }, [updatesPanelTarget]);

  const {
    projects,
    addProjectToWorkspace,
    updateProjectName,
    archiveProject,
    restoreProject,
    deleteProject,
    updateTaskName,
    updateSubitemName,
    updateTaskDate,
    changeStatus,
    changeJobType,
    addTaskToGroup,
    addSubitem,
    addSubSubitem,
    updateSubSubitemName,
    addUpdate,
    addFile,
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

  const user = useAuthStore((s) => s.user);
  const isPersonal = activeContext === 'personal';

  // ── Org state ─────────────────────────────────────────────────────────
  const userOrgs = useOrgStore((s) => s.userOrgs);
  const activeOrgWorkspaces = useOrgStore((s) => s.activeOrgWorkspaces);
  const activeOrgBoardRefs = useOrgStore((s) => s.activeOrgBoardRefs);
  const activeOrgWorkspaceId = useOrgStore((s) => s.activeOrgWorkspaceId);
  const setActiveOrgWorkspaceId = useOrgStore((s) => s.setActiveOrgWorkspaceId);

  // Archive preview: when set, this board renders read-only in the content area
  const [previewBoardId, setPreviewBoardId] = useState<string | null>(null);

  // Derive archived orgs visible to the current user (owner/admin only)
  const archivedOrgs = userOrgs.filter(
    (o) => !!o.archivedAt && (o.selfRole === 'owner' || o.selfRole === 'admin'),
  );

  // Filter personal workspaces: active vs archived
  const activePersonalWorkspaces = workspaces.filter((w) => !w.archivedAt);
  const archivedPersonalWorkspaces = workspaces.filter((w) => !!w.archivedAt);

  // Derive active workspace (personal context) — only from non-archived
  const activeWorkspace = activePersonalWorkspaces.find((w) => w.id === activeEntityId) || activePersonalWorkspaces[0];
  const activeWorkspaceId = activeWorkspace?.id || '';

  // Filter boards based on context, separating active and archived
  const allContextBoards = isPersonal
    ? projects.filter((p) => p.workspaceId === activeWorkspaceId)
    : activeOrgBoardRefs
        .map((ref) => projects.find((p) => p.id === ref.projectId))
        .filter((p): p is NonNullable<typeof p> => !!p);

  const workspaceBoards = allContextBoards.filter((p) => !p.archivedAt);

  // All archived boards across ALL workspaces (for archive view)
  const allArchivedBoards = isPersonal
    ? projects.filter((p) => !!p.archivedAt)
    : activeOrgBoardRefs
        .map((ref) => projects.find((p) => p.id === ref.projectId))
        .filter((p): p is NonNullable<typeof p> => !!p && !!p.archivedAt);

  // Determine active board
  const effectiveBoardId = activeBoardId || workspaceBoards[0]?.id || null;
  const activeProject = effectiveBoardId
    ? projects.find((p) => p.id === effectiveBoardId)
    : null;

  // Auto-accept invite token once the user is signed in
  useInviteAccept();

  // ── Membership lifecycle ────────────────────────────────────────────

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    startMembershipDiscovery();
    return () => stopMembershipDiscovery();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Org lifecycle ─────────────────────────────────────────────────────

  // Discover orgs the user belongs to
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    startOrgDiscovery(user.uid);
    return () => stopOrgDiscovery();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // When active context switches to an org, start detail listeners
  const prevContextRef = useRef<string>('personal');
  useEffect(() => {
    if (prevContextRef.current !== activeContext) {
      if (prevContextRef.current !== 'personal') {
        stopOrgDetailListeners();
      }
      prevContextRef.current = activeContext;
    }

    if (activeContext !== 'personal') {
      startOrgDetailListeners(activeContext);
      return () => stopOrgDetailListeners();
    }
  }, [activeContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // When org workspace selection changes, start board refs listener
  useEffect(() => {
    if (isPersonal || !activeOrgWorkspaceId) return;
    startOrgBoardRefsListener(activeContext, activeOrgWorkspaceId);
  }, [activeContext, activeOrgWorkspaceId, isPersonal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Project membership lifecycle ──────────────────────────────────────
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    const pid = activeProject?.id ?? null;

    if (pid !== prevProjectIdRef.current) {
      if (prevProjectIdRef.current) {
        stopProjectMembershipListeners(prevProjectIdRef.current);
      }
      prevProjectIdRef.current = pid;
    }

    if (!pid || !activeProject || !user || user.isAnonymous) return;

    void ensureProject(pid, activeProject);
    startProjectMembershipListeners(pid);

    return () => stopProjectMembershipListeners(pid);
  }, [activeProject?.id, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute permissions
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
  const canEdit = membershipLoaded
    ? (projectPermissions?.canEdit ?? false)
    : (!!user && !user.isAnonymous && !!activeProject);

  // ── Handlers ────────────────────────────────────────────────────────

  const handleSelectContext = (ctx: string) => {
    setActiveContext(ctx);
    setActiveBoardId(null);
    setPreviewBoardId(null);
  };

  // Create team modal state
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [createTeamBusy, setCreateTeamBusy] = useState(false);

  const handleOpenCreateTeam = () => {
    if (!user || user.isAnonymous) {
      alert('Please sign in to create a team.');
      return;
    }
    if (!canUseFirestore()) {
      alert('Teams require a Firestore connection. Check your Firebase config.');
      return;
    }
    setCreateTeamOpen(true);
  };

  const handleCreateOrg = async (name: string) => {
    if (!user || user.isAnonymous) return;
    setCreateTeamBusy(true);

    try {
      const orgId = await createOrg(name, user.uid, user.email || '');
      if (orgId) {
        await createOrgWorkspace(orgId, 'General');
        setCreateTeamOpen(false);
        setActiveContext(orgId);
        setActiveBoardId(null);
      } else {
        alert('Failed to create team — Firestore write was rejected.');
      }
    } catch (err) {
      console.error('createOrg failed:', err);
      alert(`Failed to create team: ${(err as Error).message || 'Unknown error'}`);
    } finally {
      setCreateTeamBusy(false);
    }
  };

  const handleCreateOrgWorkspace = async () => {
    if (isPersonal) return;
    const name = prompt('Workspace name:');
    if (!name?.trim()) return;

    const wsId = await createOrgWorkspace(activeContext, name.trim(), activeOrgWorkspaces.length);
    if (wsId) {
      setActiveOrgWorkspaceId(wsId);
    }
  };

  const handleCreateWorkspace = () => {
    const id = `w${Date.now()}`;
    setWorkspaces((prev) => [...prev, { id, name: 'New Workspace', type: 'workspace' as const }]);
    setActiveEntityId(id);
  };

  const handleCreateBoard = async () => {
    if (isPersonal) {
      // Personal board creation (same as before)
      if (!activeWorkspace) return;
      const pid = addProjectToWorkspace(activeWorkspace.id, activeWorkspace.name);
      setActiveBoardId(pid);

      const newProject = projects.find((p) => p.id === pid)
        ?? { id: pid, workspaceId: activeWorkspace.id, workspaceName: activeWorkspace.name, name: 'New Board', status: 'working' as const, groups: [], tasks: [] };
      void ensureProject(pid, newProject);
    } else {
      // Org board creation
      if (!activeOrgWorkspaceId || !user) return;
      const orgWs = activeOrgWorkspaces.find((w) => w.id === activeOrgWorkspaceId);
      const pid = addProjectToWorkspace(activeOrgWorkspaceId, orgWs?.name || 'Workspace');
      setActiveBoardId(pid);

      // Stamp org ownership on the new board
      const newProject = projects.find((p) => p.id === pid)
        ?? {
          id: pid,
          workspaceId: activeOrgWorkspaceId,
          workspaceName: orgWs?.name || 'Workspace',
          name: 'New Board',
          status: 'working' as const,
          groups: [],
          tasks: [],
          ownerType: 'org' as const,
          ownerRef: activeContext,
        };
      // Set ownership fields
      newProject.ownerType = 'org';
      newProject.ownerRef = activeContext;
      void ensureProject(pid, newProject);

      // Add board ref to the org workspace
      await addBoardToOrgWorkspace(activeContext, activeOrgWorkspaceId, pid, user.uid);
    }
  };

  const handleUpdateEntityName = (name: string) => {
    if (activeProject) {
      updateProjectName(activeProject.id, name);
      return;
    }
    if (!activeWorkspace) return;
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === activeWorkspace.id ? { ...w, name } : w)),
    );
  };

  const handleRenameWorkspace = (wsId: string, name: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === wsId ? { ...w, name } : w)),
    );
  };

  const handleRenameBoard = (boardId: string, name: string) => {
    updateProjectName(boardId, name);
  };

  const handleArchiveBoard = async (boardId: string) => {
    archiveProject(boardId);
    // Clear active board if it's the one being archived
    if (effectiveBoardId === boardId) {
      setActiveBoardId(null);
    }
    // Remove org board ref if this is an org board
    if (!isPersonal && activeOrgWorkspaceId) {
      await removeBoardFromOrgWorkspace(activeContext, activeOrgWorkspaceId, boardId);
    }
  };

  const handleRestoreBoard = (boardId: string) => {
    restoreProject(boardId);
  };

  const handleDeleteBoard = async (boardId: string) => {
    deleteProject(boardId);
    await deleteProjectFromFirestore(boardId);
  };

  const handleArchiveWorkspace = (wsId: string) => {
    // Archive workspace
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === wsId ? { ...w, archivedAt: new Date().toISOString() } : w)),
    );
    // Archive all boards in this workspace
    const boardsInWs = projects.filter((p) => p.workspaceId === wsId && !p.archivedAt);
    for (const board of boardsInWs) {
      archiveProject(board.id);
    }
    // Switch to first non-archived workspace if current
    if (activeWorkspaceId === wsId) {
      const remaining = workspaces.filter((w) => w.id !== wsId && !w.archivedAt);
      if (remaining.length > 0) {
        setActiveEntityId(remaining[0].id);
      }
    }
    setActiveBoardId(null);
  };

  const handleRestoreWorkspace = (wsId: string) => {
    // Restore workspace
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === wsId ? { ...w, archivedAt: null } : w)),
    );
    // Restore all boards in this workspace
    const boardsInWs = projects.filter((p) => p.workspaceId === wsId && !!p.archivedAt);
    for (const board of boardsInWs) {
      restoreProject(board.id);
    }
  };

  const handleDeleteWorkspace = async (wsId: string) => {
    // Delete all boards in this workspace from store and Firestore
    const boardsInWs = projects.filter((p) => p.workspaceId === wsId);
    for (const board of boardsInWs) {
      deleteProject(board.id);
      await deleteProjectFromFirestore(board.id);
    }
    // Delete workspace
    setWorkspaces((prev) => prev.filter((w) => w.id !== wsId));
  };

  const handleRenameOrg = (orgId: string, name: string) => {
    void updateOrgName(orgId, name);
  };

  const handleArchiveOrg = (orgId: string) => {
    void archiveOrg(orgId);
    // Switch to personal if the archived org is currently active
    if (activeContext === orgId) {
      setActiveContext('personal');
      setActiveBoardId(null);
    }
  };

  const handleRestoreOrg = (orgId: string) => {
    void restoreOrg(orgId);
  };

  const handleDeleteOrg = (orgId: string) => {
    void deleteOrg(orgId);
  };

  const handlePreviewArchivedBoard = (boardId: string) => {
    setPreviewBoardId(boardId);
  };

  const handleSelectOrgWorkspace = (id: string) => {
    setActiveOrgWorkspaceId(id);
    setActiveBoardId(null);
  };

  return (
    <div
      className={`h-dvh flex overflow-hidden ${
        darkMode ? 'bg-[#181b34] text-gray-200' : 'bg-[#eceff8] text-[#323338]'
      }`}
    >
      {/* Sidebar */}
      <Sidebar
        activeContext={activeContext}
        userOrgs={userOrgs.filter((o) => !o.archivedAt)}
        onSelectContext={handleSelectContext}
        onCreateOrg={handleOpenCreateTeam}
        workspaces={activePersonalWorkspaces}
        archivedWorkspaces={archivedPersonalWorkspaces}
        selectedWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={(id) => {
          setActiveEntityId(id);
          setActiveBoardId(null);
        }}
        orgWorkspaces={activeOrgWorkspaces}
        selectedOrgWorkspaceId={activeOrgWorkspaceId}
        onSelectOrgWorkspace={handleSelectOrgWorkspace}
        onCreateOrgWorkspace={handleCreateOrgWorkspace}
        boards={workspaceBoards}
        allArchivedBoards={allArchivedBoards}
        activeBoardId={effectiveBoardId}
        onSelectBoard={(id) => { setActiveBoardId(id); setPreviewBoardId(null); }}
        onCreateWorkspace={handleCreateWorkspace}
        onCreateBoard={handleCreateBoard}
        canCreateBoard={isPersonal ? !!activeWorkspaceId : !!activeOrgWorkspaceId}
        onOpenOrgMembers={!isPersonal ? () => setOrgMembersModalOpen(true) : undefined}
        onRenameBoard={handleRenameBoard}
        onArchiveBoard={handleArchiveBoard}
        onRestoreBoard={handleRestoreBoard}
        onDeleteBoard={handleDeleteBoard}
        onRenameWorkspace={handleRenameWorkspace}
        onArchiveWorkspace={handleArchiveWorkspace}
        onRestoreWorkspace={handleRestoreWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onRenameOrg={handleRenameOrg}
        onArchiveOrg={handleArchiveOrg}
        archivedOrgs={archivedOrgs}
        onRestoreOrg={handleRestoreOrg}
        onDeleteOrg={handleDeleteOrg}
        onPreviewArchivedBoard={handlePreviewArchivedBoard}
        allProjects={projects}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <AppHeader
          entityName={
            previewBoardId
              ? (projects.find((p) => p.id === previewBoardId)?.name || 'Archived Board')
              : activeProject
                ? activeProject.name
                : (isPersonal ? (activeWorkspace?.name ?? '') : (userOrgs.find((o) => o.id === activeContext)?.name ?? ''))
          }
          entityType={previewBoardId || activeProject ? 'dashboard' : 'workspace'}
          onUpdateEntityName={previewBoardId ? () => {} : handleUpdateEntityName}
          canEditEntityName={previewBoardId ? false : (activeProject ? canEdit : (isPersonal && !activeProject))}
          activeProjectId={previewBoardId ?? activeProject?.id ?? null}
        />

        {/* View content */}
        {(() => {
          const previewProject = previewBoardId ? projects.find((p) => p.id === previewBoardId) : null;
          const displayProject = previewProject || activeProject;
          const isPreviewMode = !!previewProject;
          const effectiveCanEdit = isPreviewMode ? false : canEdit;

          if (displayProject) return (
            activeTab === 'board' ? (
              <BoardView project={displayProject} canEdit={effectiveCanEdit} />
            ) : (
              <GanttView
                project={displayProject}
                statuses={statuses}
                jobTypes={jobTypes}
                canEdit={effectiveCanEdit}
                onUpdateTaskDate={isPreviewMode ? () => {} : (pid, tid, sid, start, dur, ssid) =>
                  updateTaskDate(pid, tid, sid, start, dur, ssid)
                }
                onUpdateTaskName={isPreviewMode ? () => {} : (pid, tid, v) => updateTaskName(pid, tid, v)}
                onUpdateSubitemName={isPreviewMode ? () => {} : (pid, tid, sid, v) =>
                  updateSubitemName(pid, tid, sid, v)
                }
                onChangeStatus={isPreviewMode ? () => {} : (pid, tid, sid, val, ssid) => changeStatus(pid, tid, sid, val, ssid)}
                onChangeJobType={isPreviewMode ? () => {} : (pid, tid, sid, val, ssid) => changeJobType(pid, tid, sid, val, ssid)}
                onAddTaskToGroup={isPreviewMode ? () => {} : (pid, gid) => addTaskToGroup(pid, gid)}
                onAddSubitem={isPreviewMode ? () => {} : (pid, tid) => addSubitem(pid, tid)}
                onAddSubSubitem={isPreviewMode ? () => {} : (pid, tid, sid) => addSubSubitem(pid, tid, sid)}
                onUpdateSubSubitemName={isPreviewMode ? () => {} : (pid, tid, sid, ssid, v) => updateSubSubitemName(pid, tid, sid, ssid, v)}
              />
            )
          );

          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center text-center max-w-xs px-6">

                {/* Board illustration */}
                <div className={`mb-7 ${darkMode ? 'opacity-70' : 'opacity-100'}`}>
                  <svg width="128" height="100" viewBox="0 0 128 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="14" width="116" height="72" rx="7" fill={darkMode ? '#323652' : '#e4e8f5'} />
                    <rect x="6" y="14" width="116" height="20" rx="7" fill={darkMode ? '#3d4268' : '#d0d5ea'} />
                    <rect x="6" y="27" width="116" height="7" fill={darkMode ? '#3d4268' : '#d0d5ea'} />
                    <rect x="18" y="20" width="22" height="6" rx="2" fill={darkMode ? '#555b80' : '#b5bbcf'} />
                    <rect x="54" y="20" width="22" height="6" rx="2" fill={darkMode ? '#555b80' : '#b5bbcf'} />
                    <rect x="90" y="20" width="22" height="6" rx="2" fill={darkMode ? '#555b80' : '#b5bbcf'} />
                    <rect x="18" y="42" width="20" height="5" rx="1.5" fill={darkMode ? '#484e72' : '#c8cde2'} />
                    <rect x="54" y="42" width="26" height="5" rx="1.5" fill="#3b82f6" opacity="0.65" />
                    <rect x="90" y="42" width="16" height="5" rx="1.5" fill={darkMode ? '#484e72' : '#c8cde2'} />
                    <rect x="18" y="54" width="26" height="5" rx="1.5" fill={darkMode ? '#484e72' : '#c8cde2'} />
                    <rect x="54" y="54" width="18" height="5" rx="1.5" fill={darkMode ? '#484e72' : '#c8cde2'} />
                    <rect x="90" y="54" width="22" height="5" rx="1.5" fill="#3b82f6" opacity="0.4" />
                    <rect x="18" y="66" width="16" height="5" rx="1.5" fill="#3b82f6" opacity="0.3" />
                    <rect x="54" y="66" width="22" height="5" rx="1.5" fill={darkMode ? '#484e72' : '#c8cde2'} />
                    <rect x="90" y="66" width="20" height="5" rx="1.5" fill={darkMode ? '#484e72' : '#c8cde2'} />
                    <circle cx="106" cy="14" r="13" fill="#2563eb" />
                    <path d="M106 8.5V19.5M100.5 14H111.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                  </svg>
                </div>

                <h3 className={`text-[15px] font-semibold mb-1.5 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  No board selected
                </h3>
                <p className={`text-sm leading-relaxed mb-6 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Boards help you organise tasks, track progress, and collaborate with your team.
                </p>
                <button
                  onClick={handleCreateBoard}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1V12M1 6.5H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Create a board
                </button>

              </div>
            </div>
          );
        })()}
      </div>

      {/* Right Panel — Updates or AI Chat (mutually exclusive) */}
      <div
        className={`fixed top-0 right-0 h-full w-[500px] z-[300] transition-transform duration-300 ease-in-out border-l ${
          isOpen ? 'translate-x-0 shadow-[-20px_0_60px_rgba(0,0,0,0.35)]' : 'translate-x-full'
        } ${darkMode ? 'border-l-white/5' : 'border-l-black/8'}`}
      >
      {/* AI Chat Panel — always mounted, visibility toggled via CSS to avoid mount/unmount issues */}
      <div className={aiChatOpen ? 'contents' : 'hidden'}>
        <AiChatPanel
          project={activeProject ?? null}
          onClose={closeAiChat}
        />
      </div>

      {/* Updates Panel */}
      {!aiChatOpen && shownTarget && activeProject && (() => {
        const { taskId, subitemId, subSubitemId, projectId } = shownTarget;
        const task = activeProject.tasks.find((t) => t.id === taskId);
        if (!task) return null;
        const subitem = subitemId ? task.subitems.find((s) => s.id === subitemId) : null;
        const subSubitem = subSubitemId && subitem ? (subitem.subitems || []).find((ss) => ss.id === subSubitemId) : null;
        const target = subSubitem || subitem || task;
        const targetName = target.name;
        const isNested = Boolean(subitemId);
        const updates = target.updates || [];
        const files = target.files || [];
        const parentName = subSubitem ? subitem!.name : (subitem ? task.name : undefined);
        const permissions = projectPermissions ?? getProjectPermissions(projectId);
        const effectivePerms = !membershipLoaded && user && !user.isAnonymous
          ? { ...permissions, canEdit: true, canUpload: true, canView: true, canDownload: true }
          : permissions;

        return (
          <UpdatesPanel
            taskName={targetName}
            parentName={parentName}
            isSubitem={isNested}
            updates={updates}
            files={files}
            permissions={effectivePerms}
            onClose={closeUpdatesPanel}
            onAddUpdate={(payload) => {
              const update = {
                id: `u${Date.now()}`,
                text: payload.text,
                checklist: payload.checklist,
                author: user?.displayName || user?.email || 'You',
                createdAt: new Date().toISOString(),
                replies: [],
              };
              addUpdate(projectId, taskId, subitemId, update, subSubitemId);
            }}
            onAddReply={(updateId, text) => {
              const reply = {
                id: `r${Date.now()}`,
                text,
                author: user?.displayName || user?.email || 'You',
                createdAt: new Date().toISOString(),
              };
              addReply(projectId, taskId, subitemId, updateId, reply, subSubitemId);
            }}
            onToggleChecklistItem={(updateId, itemId) => {
              toggleChecklistItem(projectId, taskId, subitemId, updateId, itemId, subSubitemId);
            }}
            onUploadFile={async (file, onProgress) => {
              const uploaded = await uploadFileWithProgress(
                projectId,
                taskId,
                subitemId,
                file,
                user?.uid ?? '',
                user?.email ?? '',
                onProgress,
              );
              addFile(projectId, taskId, subitemId, uploaded, subSubitemId);
            }}
          />
        );
      })()}
      </div>

      {/* Members Modal (board-level) */}
      {activeProject && (
        <MembersModal
          projectId={activeProject.id}
          projectName={activeProject.name}
        />
      )}

      {/* Org Members Modal (team-level) */}
      {!isPersonal && (
        <OrgMembersModal
          orgId={activeContext}
          orgName={userOrgs.find((o) => o.id === activeContext)?.name ?? 'Team'}
        />
      )}

      {/* Selection Tray */}
      {activeProject && selectedItems.size > 0 && (
        <SelectionTray projectId={activeProject.id} />
      )}

      {/* Date Picker Popup */}
      <DatePickerPopup />

      {/* Empty-name toast */}
      <EmptyNameToast />

      {/* Create Team Modal */}
      <CreateTeamModal
        open={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        onCreateTeam={handleCreateOrg}
        busy={createTeamBusy}
      />
    </div>
  );
}
