// Workspace store — workspaces, dashboards, and label definitions.
// Uses useHybridState for localStorage + Firestore sync.
//
// IMPORTANT: useWorkspaceData() must only be called ONCE (in the provider).
// All other components access it via useWorkspaceContext().
// Multiple calls create duplicate Firestore listeners that fight each other.

import { createContext, useContext } from 'react';
import { create } from 'zustand';
import type { Workspace, Dashboard } from '../types/workspace';
import type { StatusLabel, JobTypeLabel } from '../config/constants';
import { DEFAULT_STATUSES, DEFAULT_JOB_TYPES } from '../config/constants';
import { useHybridState } from '../services/firebase/hybridSync';

// --- Initial data ---
const INITIAL_WORKSPACES: Workspace[] = [
  { id: 'w1', name: 'Main Workspace', type: 'workspace' },
  { id: 'w2', name: 'Marketing', type: 'workspace' },
];

const INITIAL_DASHBOARDS: Dashboard[] = [
  { id: 'd1', name: 'Overview', type: 'dashboard', includedWorkspaces: ['w1'] },
];

// --- Store (non-synced state: active selections, UI) ---
interface WorkspaceUIState {
  activeEntityId: string;
  activeBoardId: string | null;

  setActiveEntityId: (id: string) => void;
  setActiveBoardId: (id: string | null) => void;
}

export const useWorkspaceUIStore = create<WorkspaceUIState>((set) => ({
  activeEntityId: 'w1',
  activeBoardId: null,

  setActiveEntityId: (id) => set({ activeEntityId: id }),
  setActiveBoardId: (id) => set({ activeBoardId: id }),
}));

// --- Synced hooks (these use useHybridState for persistence) ---

export function useWorkspaces() {
  return useHybridState<Workspace[]>('pmai_workspaces', INITIAL_WORKSPACES, 'workspaces');
}

export function useDashboards() {
  return useHybridState<Dashboard[]>('pmai_dashboards', INITIAL_DASHBOARDS, 'dashboards');
}

export function useStatuses() {
  return useHybridState<StatusLabel[]>('pmai_statuses', DEFAULT_STATUSES, 'statuses');
}

export function useJobTypes() {
  return useHybridState<JobTypeLabel[]>('pmai_jobTypes', DEFAULT_JOB_TYPES, 'jobTypes');
}

/**
 * Combined workspace data hook.
 * Returns all synced workspace data and setters.
 */
export function useWorkspaceData() {
  const [workspaces, setWorkspaces] = useWorkspaces();
  const [dashboards, setDashboards] = useDashboards();
  const [statuses, setStatuses] = useStatuses();
  const [jobTypes, setJobTypes] = useJobTypes();

  const { activeEntityId, activeBoardId, setActiveEntityId, setActiveBoardId } =
    useWorkspaceUIStore();

  return {
    workspaces,
    setWorkspaces,
    dashboards,
    setDashboards,
    statuses,
    setStatuses,
    jobTypes,
    setJobTypes,
    activeEntityId,
    activeBoardId,
    setActiveEntityId,
    setActiveBoardId,
  };
}

// --- Context-based singleton access ---

/** Return type of useWorkspaceData for context typing. */
export type WorkspaceDataValue = ReturnType<typeof useWorkspaceData>;

const WorkspaceDataContext = createContext<WorkspaceDataValue | null>(null);

/**
 * Provider that calls useWorkspaceData() exactly once and shares the result.
 * Wrap your app (or AppShell) in this provider.
 */
export function WorkspaceDataProvider({ children }: { children: React.ReactNode }) {
  const value = useWorkspaceData();
  return (
    <WorkspaceDataContext.Provider value={value}>
      {children}
    </WorkspaceDataContext.Provider>
  );
}

/**
 * Access the shared workspace data from context.
 * Must be used inside a <WorkspaceDataProvider>.
 */
export function useWorkspaceContext(): WorkspaceDataValue {
  const ctx = useContext(WorkspaceDataContext);
  if (!ctx) {
    throw new Error('useWorkspaceContext must be used inside <WorkspaceDataProvider>');
  }
  return ctx;
}
