// Workspace store — workspaces, dashboards, and label definitions.
// Uses useHybridState for localStorage + Firestore sync.

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
