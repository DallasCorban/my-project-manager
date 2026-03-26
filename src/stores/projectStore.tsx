// Project store — projects CRUD with hybrid sync.
// Ported from App.jsx useProjectData() (lines 518-610).
//
// IMPORTANT: useProjectData() must only be called ONCE (in the provider).
// All other components access it via useProjectContext().
// Multiple useProjectData() calls create duplicate Firestore listeners
// and debounce timers that fight each other, causing echo-back jitter.

import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { Board } from '../types/board';
import type { Item, Subitem, SubSubitem, Update, Reply } from '../types/item';
import type { ProjectFile } from '../types/file';
import { useHybridState } from '../services/firebase/hybridSync';
import { writeProjectState, updateProjectMetadata } from '../services/firebase/projectSync';
import { useAuthStore } from '../stores/authStore';
import {
  addDaysToKey,
  isDateKey,
  normalizeDateKey,
  toLocalDateKey,
  getTodayKey,
} from '../utils/date';

// --- Helper: generate date keys relative to today ---
const TODAY_KEY = getTodayKey();
const dateKeyFromRelativeIndex = (relIndex: number): string | null =>
  addDaysToKey(TODAY_KEY, relIndex);

// --- Demo data (kept for potential future use, e.g. "Load sample project") ---
export const DEMO_PROJECTS: Board[] = [
  {
    id: 'p1',
    workspaceId: 'w1',
    name: 'Website Redesign',
    status: 'working',
    groups: [
      { id: 'g1', name: 'Phase 1: Planning', color: '#579bfc' },
      { id: 'g2', name: 'Phase 2: Development', color: '#a25ddc' },
    ],
    tasks: [
      {
        id: 't1', groupId: 'g1', name: 'Discovery Phase',
        start: dateKeyFromRelativeIndex(0), duration: 15, progress: 100,
        status: 'done', assignees: [], priority: 'High', jobTypeId: 'research',
        subitems: [
          { id: 's1', name: 'Stakeholder Interviews', status: 'done', assignees: [], start: dateKeyFromRelativeIndex(0), duration: 5, jobTypeId: 'research' },
          { id: 's2', name: 'Requirement Gathering', status: 'working', assignees: [], start: dateKeyFromRelativeIndex(5), duration: 10, jobTypeId: 'planning' },
        ],
      },
      { id: 't2', groupId: 'g1', name: 'Wireframing', start: dateKeyFromRelativeIndex(16), duration: 20, progress: 60, status: 'working', assignees: [], priority: 'Medium', jobTypeId: 'design', subitems: [] },
      { id: 't3', groupId: 'g2', name: 'UI Design', start: dateKeyFromRelativeIndex(30), duration: 30, progress: 0, status: 'pending', assignees: [], priority: 'High', jobTypeId: 'design', subitems: [] },
      { id: 't4', groupId: 'g2', name: 'Frontend Dev', start: null, duration: null, progress: 0, status: 'pending', assignees: [], priority: 'High', jobTypeId: 'dev', subitems: [] },
    ],
  },
];

// --- Generic field updater that handles all 3 nesting levels ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAtDepth(
  projects: Board[],
  pid: string,
  tid: string,
  sid: string | null,
  ssid: string | null,
  updater: (item: any) => any,
): Board[] {
  return projects.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      tasks: p.tasks.map((t) => {
        if (ssid && sid) {
          // Level 3: sub-subitem
          if (t.id === tid || t.subitems.some((s) => s.id === sid)) {
            return {
              ...t,
              subitems: t.subitems.map((sub) =>
                sub.id === sid
                  ? {
                      ...sub,
                      subitems: (sub.subitems || []).map((ss: SubSubitem) =>
                        ss.id === ssid ? updater(ss) : ss,
                      ),
                    }
                  : sub,
              ),
            };
          }
          return t;
        }
        if (sid) {
          // Level 2: subitem (find by sid across all tasks)
          if (t.subitems.some((sub) => sub.id === sid)) {
            return {
              ...t,
              subitems: t.subitems.map((sub) =>
                sub.id === sid ? updater(sub) : sub,
              ),
            };
          }
          return t;
        }
        // Level 1: item
        return t.id === tid ? updater(t) : t;
      }),
    };
  });
}

/** Shorthand for setting a single field at any depth. */
function updateFieldAtDepth(
  projects: Board[],
  pid: string,
  tid: string,
  sid: string | null,
  ssid: string | null,
  field: string,
  value: unknown,
): Board[] {
  return applyAtDepth(projects, pid, tid, sid, ssid, (item: any) => ({ ...item, [field]: value }));
}

/**
 * Hook providing all project data and CRUD actions with hybrid sync.
 */
export function useProjectData() {
  const [projects, setProjects] = useHybridState<Board[]>(
    'pmai_projects',
    [],
    'projects',
  );

  // --- Date migration (legacy numeric start → date keys) ---
  useEffect(() => {
    if (!projects || !Array.isArray(projects)) return;
    let needsMigration = false;
    const baseKeyRaw =
      typeof window !== 'undefined' ? window.localStorage.getItem('pmai_baseDate') : null;
    const baseKey = isDateKey(baseKeyRaw) ? (baseKeyRaw as string) : toLocalDateKey(new Date());

    const migrateItem = <T extends { start?: unknown }>(item: T): T => {
      if (!item) return item;
      if (typeof item.start === 'number') {
        needsMigration = true;
        return { ...item, start: addDaysToKey(baseKey, item.start as number) };
      }
      const normalized = normalizeDateKey(item.start);
      if (normalized && normalized !== item.start) {
        needsMigration = true;
        return { ...item, start: normalized };
      }
      return item;
    };

    // Migrate assignee (string) → assignees (string[])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const migrateAssignee = <T extends Record<string, any>>(item: T): T => {
      if (item && !('assignees' in item) && 'assignee' in item) {
        needsMigration = true;
        const a = item.assignee as string;
        const { assignee: _, ...rest } = item;
        return { ...rest, assignees: a && a !== 'Unassigned' ? [a] : [] } as T;
      }
      // Ensure assignees is always an array (defensive)
      if (item && 'assignees' in item && !Array.isArray(item.assignees)) {
        needsMigration = true;
        return { ...item, assignees: [] } as T;
      }
      return item;
    };

    const nextProjects = projects.map((p) => ({
      ...p,
      tasks: (p.tasks || []).map((t) => ({
        ...migrateAssignee(migrateItem(t)),
        subitems: (t.subitems || []).map((s) => ({
          ...migrateAssignee(migrateItem(s)),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          subitems: (s.subitems || []).map((ss: any) => migrateAssignee(migrateItem(ss))),
        })),
      })),
    }));

    if (needsMigration) {
      setProjects(nextProjects as Board[]);
      try {
        window.localStorage.removeItem('pmai_baseDate');
      } catch { /* ignore */ }
    }
  }, [projects, setProjects]);

  // --- Dual-write: sync each project to projects/{id}/state/main ---
  // This creates a shared, per-project copy of the board state in Firestore
  // alongside the per-user hybridSync blob.  This serves as both a backup and
  // the foundation for multi-user collaboration (other members can subscribe
  // to the shared state doc).
  const user = useAuthStore((s) => s.user);
  const prevProjectsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projects || !Array.isArray(projects) || projects.length === 0) return;
    if (!user) return;

    // Serialize to detect actual changes (avoid redundant writes)
    const serialized = JSON.stringify(projects);
    if (serialized === prevProjectsRef.current) return;
    prevProjectsRef.current = serialized;

    // Write each non-archived project to its shared state doc
    for (const project of projects) {
      if (project.archivedAt) continue;
      writeProjectState(project.id, project, user.uid);
    }
  }, [projects, user]);

  // --- CRUD Actions ---
  const actions = {
    addProjectToWorkspace: (workspaceId: string, workspaceName: string, name?: string): string => {
      const stamp = Date.now();
      const projectId = `p${stamp}`;
      const groupId = `g${stamp}`;
      const nextName = (name || 'New Board').trim() || 'New Board';
      const nextProject: Board = {
        id: projectId,
        workspaceId,
        workspaceName: workspaceName || '',
        name: nextName,
        status: 'working',
        groups: [{ id: groupId, name: 'Group 1', color: '#579bfc' }],
        tasks: [],
      };
      setProjects((prev) => [...prev, nextProject]);
      return projectId;
    },

    addGroup: (pid: string): void => {
      const newGroup = { id: `g${Date.now()}`, name: 'New Group', color: '#579bfc' };
      setProjects((prev) =>
        prev.map((p) => (p.id === pid ? { ...p, groups: [...p.groups, newGroup] } : p)),
      );
    },

    updateProjectName: (id: string, v: string): void => {
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: v } : p)));
      // Also update the shared project metadata doc so the name stays in sync
      if (user) {
        updateProjectMetadata(id, { name: v }, user.uid);
      }
    },

    archiveProject: (id: string): void => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, archivedAt: new Date().toISOString() } : p)),
      );
    },

    restoreProject: (id: string): void => {
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)),
      );
    },

    deleteProject: (id: string): void => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    },

    updateGroupName: (pid: string, gid: string, v: string): void => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === pid
            ? { ...p, groups: p.groups.map((g) => (g.id === gid ? { ...g, name: v } : g)) }
            : p,
        ),
      );
    },

    updateTaskName: (pid: string, tid: string, v: string): void => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === pid
            ? { ...p, tasks: p.tasks.map((t) => (t.id === tid ? { ...t, name: v } : t)) }
            : p,
        ),
      );
    },

    updateSubitemName: (pid: string, tid: string, sid: string, v: string): void => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === pid
            ? {
                ...p,
                tasks: p.tasks.map((t) =>
                  t.id === tid
                    ? { ...t, subitems: t.subitems.map((s) => (s.id === sid ? { ...s, name: v } : s)) }
                    : t,
                ),
              }
            : p,
        ),
      );
    },

    addTaskToGroup: (pid: string, gid: string, name?: string): void => {
      const newTask: Item = {
        id: `t${Date.now()}`,
        groupId: gid,
        name: name || 'New Item',
        start: null,
        duration: null,
        progress: 0,
        status: 'pending',
        jobTypeId: 'dev',
        assignees: [],
        priority: 'Low',
        subitems: [],
      };
      setProjects((prev) =>
        prev.map((p) => (p.id === pid ? { ...p, tasks: [...p.tasks, newTask] } : p)),
      );
    },

    addSubitem: (pid: string, tid: string, name?: string): void => {
      const newSub: Subitem = {
        id: `s${Date.now()}`,
        name: name || 'New Subitem',
        status: 'pending',
        jobTypeId: 'dev',
        assignees: [],
        start: null,
        duration: null,
      };
      setProjects((prev) =>
        prev.map((p) =>
          p.id === pid
            ? { ...p, tasks: p.tasks.map((t) => (t.id === tid ? { ...t, subitems: [...t.subitems, newSub] } : t)) }
            : p,
        ),
      );
    },

    addSubSubitem: (pid: string, tid: string, sid: string, name?: string): void => {
      const newSS: SubSubitem = {
        id: `ss${Date.now()}`,
        name: name || 'New Sub-subitem',
        status: 'pending',
        jobTypeId: 'dev',
        assignees: [],
        start: null,
        duration: null,
      };
      setProjects((prev) =>
        prev.map((p) =>
          p.id === pid
            ? {
                ...p,
                tasks: p.tasks.map((t) =>
                  t.id === tid
                    ? {
                        ...t,
                        subitems: t.subitems.map((s) =>
                          s.id === sid
                            ? { ...s, subitems: [...(s.subitems || []), newSS] }
                            : s,
                        ),
                      }
                    : t,
                ),
              }
            : p,
        ),
      );
    },

    updateSubSubitemName: (pid: string, tid: string, sid: string, ssid: string, v: string): void => {
      setProjects((prev) => updateFieldAtDepth(prev, pid, tid, sid, ssid, 'name', v));
    },

    updateTaskDate: (
      pid: string,
      tid: string,
      sid: string | null,
      start: string | null,
      duration: number | null,
      ssid: string | null = null,
    ): void => {
      setProjects((prev) =>
        applyAtDepth(prev, pid, tid, sid, ssid, (item) => ({ ...item, start, duration })),
      );
    },

    changeStatus: (pid: string, tid: string, sid: string | null, val: string, ssid: string | null = null): void => {
      setProjects((prev) => updateFieldAtDepth(prev, pid, tid, sid, ssid, 'status', val));
    },

    changeJobType: (pid: string, tid: string, sid: string | null, val: string, ssid: string | null = null): void => {
      setProjects((prev) => updateFieldAtDepth(prev, pid, tid, sid, ssid, 'jobTypeId', val));
    },

    changeItemType: (pid: string, tid: string, sid: string | null, val: string, ssid: string | null = null): void => {
      setProjects((prev) => updateFieldAtDepth(prev, pid, tid, sid, ssid, 'itemTypeId', val));
    },

    toggleAssignee: (pid: string, tid: string, sid: string | null, uid: string, ssid: string | null = null): void => {
      setProjects((prev) =>
        applyAtDepth(prev, pid, tid, sid, ssid, (item) => {
          const cur = (item.assignees as string[]) || [];
          return {
            ...item,
            assignees: cur.includes(uid) ? cur.filter((a: string) => a !== uid) : [...cur, uid],
          };
        }),
      );
    },

    addUpdate: (pid: string, tid: string, sid: string | null, update: Update, ssid: string | null = null): void => {
      setProjects((prev) =>
        applyAtDepth(prev, pid, tid, sid, ssid, (item) => ({
          ...item,
          updates: [update, ...((item.updates as Update[]) || [])],
        })),
      );
    },

    addFile: (pid: string, tid: string, sid: string | null, file: ProjectFile, ssid: string | null = null): void => {
      setProjects((prev) =>
        applyAtDepth(prev, pid, tid, sid, ssid, (item) => ({
          ...item,
          files: [file, ...((item.files as ProjectFile[]) || [])],
        })),
      );
    },

    addReply: (
      pid: string,
      tid: string,
      sid: string | null,
      updateId: string,
      reply: Reply,
      ssid: string | null = null,
    ): void => {
      setProjects((prev) =>
        applyAtDepth(prev, pid, tid, sid, ssid, (item) => ({
          ...item,
          updates: ((item.updates as Update[]) || []).map((u) =>
            u.id === updateId ? { ...u, replies: [reply, ...(u.replies || [])] } : u,
          ),
        })),
      );
    },

    toggleChecklistItem: (
      pid: string,
      tid: string,
      sid: string | null,
      updateId: string,
      itemId: string,
      ssid: string | null = null,
    ): void => {
      setProjects((prev) =>
        applyAtDepth(prev, pid, tid, sid, ssid, (item) => ({
          ...item,
          updates: ((item.updates as Update[]) || []).map((u) => {
            if (u.id !== updateId) return u;
            return {
              ...u,
              checklist: (u.checklist || []).map((ci) =>
                ci.id === itemId ? { ...ci, done: !ci.done } : ci,
              ),
            };
          }),
        })),
      );
    },

    deleteSelection: (ids: Set<string>): void => {
      setProjects((prev) =>
        prev.map((p) => ({
          ...p,
          tasks: p.tasks
            .filter((t) => !ids.has(t.id))
            .map((t) => ({
              ...t,
              subitems: t.subitems
                .filter((s) => !ids.has(s.id))
                .map((s) => ({
                  ...s,
                  subitems: (s.subitems || []).filter((ss) => !ids.has(ss.id)),
                })),
            })),
        })),
      );
    },

    /** Reorder tasks within a group via splice-based move. */
    reorderTasks: (pid: string, groupId: string, fromIndex: number, toIndex: number): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          const groupTasks = p.tasks.filter((t) => t.groupId === groupId);
          const otherTasks = p.tasks.filter((t) => t.groupId !== groupId);
          const [moved] = groupTasks.splice(fromIndex, 1);
          if (!moved) return p;
          groupTasks.splice(toIndex, 0, moved);
          return { ...p, tasks: [...otherTasks, ...groupTasks] };
        }),
      );
    },

    /** Move a task from one group to another at a specific index. */
    moveTaskToGroup: (
      pid: string,
      taskId: string,
      _fromGroupId: string,
      toGroupId: string,
      toIndex: number,
    ): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          const task = p.tasks.find((t) => t.id === taskId);
          if (!task) return p;
          const remaining = p.tasks.filter((t) => t.id !== taskId);
          const movedTask = { ...task, groupId: toGroupId };
          const targetGroupTasks = remaining.filter((t) => t.groupId === toGroupId);
          const otherTasks = remaining.filter((t) => t.groupId !== toGroupId);
          targetGroupTasks.splice(toIndex, 0, movedTask);
          return { ...p, tasks: [...otherTasks, ...targetGroupTasks] };
        }),
      );
    },

    /** Reorder sub-subitems within a subitem. */
    reorderSubSubitems: (pid: string, taskId: string, subitemId: string, fromIndex: number, toIndex: number): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                subitems: t.subitems.map((s) => {
                  if (s.id !== subitemId) return s;
                  const subs = [...(s.subitems || [])];
                  const [moved] = subs.splice(fromIndex, 1);
                  if (!moved) return s;
                  subs.splice(toIndex, 0, moved);
                  return { ...s, subitems: subs };
                }),
              };
            }),
          };
        }),
      );
    },

    /** Reorder subitems within a task. */
    reorderSubitems: (pid: string, taskId: string, fromIndex: number, toIndex: number): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (t.id !== taskId) return t;
              const subs = [...t.subitems];
              const [moved] = subs.splice(fromIndex, 1);
              if (!moved) return t;
              subs.splice(toIndex, 0, moved);
              return { ...t, subitems: subs };
            }),
          };
        }),
      );
    },

    /** Reorder groups within a project. */
    reorderGroups: (pid: string, fromIndex: number, toIndex: number): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          const groups = [...p.groups];
          const [moved] = groups.splice(fromIndex, 1);
          if (!moved) return p;
          groups.splice(toIndex, 0, moved);
          return { ...p, groups };
        }),
      );
    },

    /** Duplicate selected items. */
    duplicateItems: (ids: Set<string>): void => {
      setProjects((prev) =>
        prev.map((p) => {
          const newTasks: Item[] = [];
          const updatedTasks = p.tasks.map((t) => {
            // Duplicate sub-subitems within subitems
            const updatedSubitems = t.subitems.map((s) => {
              const newSubSubs = (s.subitems || []).filter((ss) => ids.has(ss.id)).map((ss) => ({
                ...ss,
                id: `ss${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: `${ss.name} (copy)`,
              }));
              return newSubSubs.length > 0
                ? { ...s, subitems: [...(s.subitems || []), ...newSubSubs] }
                : s;
            });

            // Duplicate subitems
            const newSubs = updatedSubitems.filter((s) => ids.has(s.id)).map((s) => ({
              ...s,
              id: `s${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: `${s.name} (copy)`,
              subitems: (s.subitems || []).map((ss) => ({
                ...ss,
                id: `ss${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              })),
            }));
            const finalSubitems = newSubs.length > 0
              ? [...updatedSubitems, ...newSubs]
              : updatedSubitems;

            const updatedTask = { ...t, subitems: finalSubitems };

            if (ids.has(t.id)) {
              newTasks.push({
                ...t,
                id: `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: `${t.name} (copy)`,
                subitems: t.subitems.map((s) => ({
                  ...s,
                  id: `s${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  subitems: (s.subitems || []).map((ss) => ({
                    ...ss,
                    id: `ss${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  })),
                })),
              });
            }

            return updatedTask;
          });
          return { ...p, tasks: [...updatedTasks, ...newTasks] };
        }),
      );
    },
  };

  // Stabilize the actions object so context consumers don't re-render
  // when only `projects` changes (they can select just the actions they need).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableActions = useMemo(() => actions, [setProjects]);

  return { projects, setProjects, ...stableActions };
}

// --- Context-based singleton access ---

/** Return type of useProjectData for context typing. */
export type ProjectDataValue = ReturnType<typeof useProjectData>;

const ProjectDataContext = createContext<ProjectDataValue | null>(null);

/**
 * Provider that calls useProjectData() exactly once and shares the result.
 * Wrap your app (or AppShell) in this provider.
 */
export function ProjectDataProvider({ children }: { children: React.ReactNode }) {
  const value = useProjectData();
  return (
    <ProjectDataContext.Provider value={value}>
      {children}
    </ProjectDataContext.Provider>
  );
}

/**
 * Access the shared project data from context.
 * Must be used inside a <ProjectDataProvider>.
 */
export function useProjectContext(): ProjectDataValue {
  const ctx = useContext(ProjectDataContext);
  if (!ctx) {
    throw new Error('useProjectContext must be used inside <ProjectDataProvider>');
  }
  return ctx;
}
