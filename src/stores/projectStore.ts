// Project store — projects CRUD with hybrid sync.
// Ported from App.jsx useProjectData() (lines 518-610).

import { useEffect } from 'react';
import type { Board } from '../types/board';
import type { Item, Subitem, Update, Reply } from '../types/item';
import type { ProjectFile } from '../types/file';
import { useHybridState } from '../services/firebase/hybridSync';
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

// --- Initial demo data ---
const INITIAL_PROJECTS: Board[] = [
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
        status: 'done', assignee: 'Sarah', priority: 'High', jobTypeId: 'research',
        subitems: [
          { id: 's1', name: 'Stakeholder Interviews', status: 'done', assignee: 'Sarah', start: dateKeyFromRelativeIndex(0), duration: 5, jobTypeId: 'research' },
          { id: 's2', name: 'Requirement Gathering', status: 'working', assignee: 'Mike', start: dateKeyFromRelativeIndex(5), duration: 10, jobTypeId: 'planning' },
        ],
      },
      { id: 't2', groupId: 'g1', name: 'Wireframing', start: dateKeyFromRelativeIndex(16), duration: 20, progress: 60, status: 'working', assignee: 'Mike', priority: 'Medium', jobTypeId: 'design', subitems: [] },
      { id: 't3', groupId: 'g2', name: 'UI Design', start: dateKeyFromRelativeIndex(30), duration: 30, progress: 0, status: 'pending', assignee: 'Jessica', priority: 'High', jobTypeId: 'design', subitems: [] },
      { id: 't4', groupId: 'g2', name: 'Frontend Dev', start: null, duration: null, progress: 0, status: 'pending', assignee: 'Dev Team', priority: 'High', jobTypeId: 'dev', subitems: [] },
    ],
  },
];

// --- Generic field updater for tasks/subitems ---
function updateTaskField(
  projects: Board[],
  pid: string,
  tid: string,
  _sid: string | null,
  field: string,
  value: unknown,
  isSubitem: boolean,
): Board[] {
  return projects.map((p) => {
    if (p.id !== pid) return p;
    return {
      ...p,
      tasks: p.tasks.map((t) => {
        if (isSubitem) {
          if (t.subitems.some((sub) => sub.id === tid)) {
            return {
              ...t,
              subitems: t.subitems.map((sub) =>
                sub.id === tid ? { ...sub, [field]: value } : sub,
              ),
            };
          }
          return t;
        }
        return t.id === tid ? { ...t, [field]: value } : t;
      }),
    };
  });
}

/**
 * Hook providing all project data and CRUD actions with hybrid sync.
 */
export function useProjectData() {
  const [projects, setProjects] = useHybridState<Board[]>(
    'pmai_projects',
    INITIAL_PROJECTS,
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

    const nextProjects = projects.map((p) => ({
      ...p,
      tasks: (p.tasks || []).map((t) => ({
        ...migrateItem(t),
        subitems: (t.subitems || []).map((s) => migrateItem(s)),
      })),
    }));

    if (needsMigration) {
      setProjects(nextProjects as Board[]);
      try {
        window.localStorage.removeItem('pmai_baseDate');
      } catch { /* ignore */ }
    }
  }, [projects, setProjects]);

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
        assignee: 'Unassigned',
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
        assignee: 'Unassigned',
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

    updateTaskDate: (
      pid: string,
      tid: string,
      sid: string | null,
      start: string | null,
      duration: number | null,
    ): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (sid) {
                if (t.id === tid) {
                  return {
                    ...t,
                    subitems: t.subitems.map((sub) =>
                      sub.id === sid ? { ...sub, start, duration } : sub,
                    ),
                  };
                }
                return t;
              }
              if (t.id === tid) return { ...t, start, duration };
              return t;
            }),
          };
        }),
      );
    },

    changeStatus: (pid: string, tid: string, sid: string | null, val: string): void => {
      if (sid) {
        setProjects((prev) => updateTaskField(prev, pid, sid, null, 'status', val, true));
      } else {
        setProjects((prev) => updateTaskField(prev, pid, tid, null, 'status', val, false));
      }
    },

    changeJobType: (pid: string, tid: string, sid: string | null, val: string): void => {
      if (sid) {
        setProjects((prev) => updateTaskField(prev, pid, sid, null, 'jobTypeId', val, true));
      } else {
        setProjects((prev) => updateTaskField(prev, pid, tid, null, 'jobTypeId', val, false));
      }
    },

    addUpdate: (pid: string, tid: string, sid: string | null, update: Update): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (sid) {
                if (t.id === tid) {
                  return {
                    ...t,
                    subitems: t.subitems.map((sub) =>
                      sub.id === sid
                        ? { ...sub, updates: [update, ...(sub.updates || [])] }
                        : sub,
                    ),
                  };
                }
                return t;
              }
              if (t.id === tid) return { ...t, updates: [update, ...(t.updates || [])] };
              return t;
            }),
          };
        }),
      );
    },

    addFile: (pid: string, tid: string, sid: string | null, file: ProjectFile): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (sid) {
                if (t.id === tid) {
                  return {
                    ...t,
                    subitems: t.subitems.map((sub) =>
                      sub.id === sid
                        ? { ...sub, files: [file, ...(sub.files || [])] }
                        : sub,
                    ),
                  };
                }
                return t;
              }
              if (t.id === tid) return { ...t, files: [file, ...(t.files || [])] };
              return t;
            }),
          };
        }),
      );
    },

    addReply: (
      pid: string,
      tid: string,
      sid: string | null,
      updateId: string,
      reply: Reply,
    ): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              if (sid) {
                if (t.id === tid) {
                  return {
                    ...t,
                    subitems: t.subitems.map((sub) =>
                      sub.id === sid
                        ? {
                            ...sub,
                            updates: (sub.updates || []).map((u) =>
                              u.id === updateId
                                ? { ...u, replies: [reply, ...(u.replies || [])] }
                                : u,
                            ),
                          }
                        : sub,
                    ),
                  };
                }
                return t;
              }
              if (t.id === tid) {
                return {
                  ...t,
                  updates: (t.updates || []).map((u) =>
                    u.id === updateId ? { ...u, replies: [reply, ...(u.replies || [])] } : u,
                  ),
                };
              }
              return t;
            }),
          };
        }),
      );
    },

    toggleChecklistItem: (
      pid: string,
      tid: string,
      sid: string | null,
      updateId: string,
      itemId: string,
    ): void => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          return {
            ...p,
            tasks: p.tasks.map((t) => {
              const toggleChecklist = (updates: Update[] | undefined) =>
                (updates || []).map((u) => {
                  if (u.id !== updateId) return u;
                  return {
                    ...u,
                    checklist: (u.checklist || []).map((item) =>
                      item.id === itemId ? { ...item, done: !item.done } : item,
                    ),
                  };
                });

              if (sid) {
                if (t.id === tid) {
                  return {
                    ...t,
                    subitems: t.subitems.map((sub) =>
                      sub.id === sid
                        ? { ...sub, updates: toggleChecklist(sub.updates) }
                        : sub,
                    ),
                  };
                }
                return t;
              }
              if (t.id === tid) return { ...t, updates: toggleChecklist(t.updates) };
              return t;
            }),
          };
        }),
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
              subitems: t.subitems.filter((s) => !ids.has(s.id)),
            })),
        })),
      );
    },
  };

  return { projects, setProjects, ...actions };
}
