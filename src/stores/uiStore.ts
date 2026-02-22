// UI store — app-wide UI state (dark mode, active tab, menus, selections).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DatePickerState, UpdatesPanelTarget } from '../types/timeline';

type ViewTab = 'board' | 'gantt';

interface UIState {
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean) => void;

  // View
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;

  // Menus / panels
  settingsMenuOpen: boolean;
  setSettingsMenuOpen: (open: boolean) => void;

  statusMenuOpen: string | null;
  statusMenuType: 'status' | 'type';
  openStatusMenu: (id: string, type: 'status' | 'type') => void;
  closeStatusMenu: () => void;

  datePickerOpen: DatePickerState | null;
  openDatePicker: (state: DatePickerState) => void;
  closeDatePicker: () => void;

  membersModalOpen: boolean;
  setMembersModalOpen: (open: boolean) => void;

  /** The Gantt bar currently selected as the zoom anchor.
   *  Single-click on a bar sets this; click on empty space clears it. */
  focusedBar: { taskId: string; subitemId: string | null } | null;
  setFocusedBar: (bar: { taskId: string; subitemId: string | null } | null) => void;

  updatesPanelTarget: UpdatesPanelTarget | null;
  openUpdatesPanel: (target: UpdatesPanelTarget) => void;
  closeUpdatesPanel: () => void;
  /** Toggle the panel for a given target:
   *  - same item already open → close
   *  - closed or different item → open / switch (no close animation between items) */
  toggleUpdatesPanel: (target: UpdatesPanelTarget) => void;

  // Selection
  selectedItems: Set<string>;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  // Collapsed / expanded
  collapsedGroups: string[];
  toggleGroupCollapse: (gid: string) => void;
  setCollapsedGroups: (ids: string[]) => void;
  expandedItems: string[];
  toggleItemExpand: (tid: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Theme
      darkMode: false,
      toggleDarkMode: () => {
        const next = !get().darkMode;
        set({ darkMode: next });
        document.documentElement.classList.toggle('dark', next);
      },
      setDarkMode: (dark) => {
        set({ darkMode: dark });
        document.documentElement.classList.toggle('dark', dark);
      },

      // View
      activeTab: 'board' as ViewTab,
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Menus / panels
      settingsMenuOpen: false,
      setSettingsMenuOpen: (open) => set({ settingsMenuOpen: open }),

      statusMenuOpen: null,
      statusMenuType: 'status' as const,
      openStatusMenu: (id, type) => set({ statusMenuOpen: id, statusMenuType: type }),
      closeStatusMenu: () => set({ statusMenuOpen: null }),

      datePickerOpen: null,
      openDatePicker: (state) => set({ datePickerOpen: state }),
      closeDatePicker: () => set({ datePickerOpen: null }),

      membersModalOpen: false,
      setMembersModalOpen: (open) => set({ membersModalOpen: open }),

      focusedBar: null,
      setFocusedBar: (bar) => set({ focusedBar: bar }),

      updatesPanelTarget: null,
      openUpdatesPanel: (target) => set({ updatesPanelTarget: target }),
      closeUpdatesPanel: () => set({ updatesPanelTarget: null }),
      toggleUpdatesPanel: (target) =>
        set((state) => {
          const cur = state.updatesPanelTarget;
          if (
            cur &&
            cur.taskId === target.taskId &&
            cur.subitemId === target.subitemId
          ) {
            return { updatesPanelTarget: null };
          }
          return { updatesPanelTarget: target };
        }),

      // Selection
      selectedItems: new Set<string>(),
      toggleSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedItems);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedItems: next };
        }),
      selectAll: (ids) => set({ selectedItems: new Set(ids) }),
      clearSelection: () => set({ selectedItems: new Set() }),

      // Collapsed / expanded
      collapsedGroups: [] as string[],
      toggleGroupCollapse: (gid) =>
        set((state) => ({
          collapsedGroups: state.collapsedGroups.includes(gid)
            ? state.collapsedGroups.filter((id) => id !== gid)
            : [...state.collapsedGroups, gid],
        })),
      setCollapsedGroups: (ids) => set({ collapsedGroups: ids }),

      expandedItems: [] as string[],
      toggleItemExpand: (tid) =>
        set((state) => ({
          expandedItems: state.expandedItems.includes(tid)
            ? state.expandedItems.filter((id) => id !== tid)
            : [...state.expandedItems, tid],
        })),
    }),
    {
      name: 'pmai_ui',
      // Only persist theme and view preferences, not transient menus
      partialize: (state) => ({
        darkMode: state.darkMode,
        activeTab: state.activeTab,
        collapsedGroups: state.collapsedGroups,
        expandedItems: state.expandedItems,
      }),
    },
  ),
);

/** Sync dark mode class on initial load */
export function initDarkMode(): void {
  const dark = useUIStore.getState().darkMode;
  document.documentElement.classList.toggle('dark', dark);
}
