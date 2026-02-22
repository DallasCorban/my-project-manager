import type { Role, RoleOption } from '../types/member';
import type { BoardColumns } from '../types/timeline';

// --- Status labels ---
export interface StatusLabel {
  id: string;
  label: string;
  color: string;
}

export const DEFAULT_STATUSES: StatusLabel[] = [
  { id: 'done', label: 'Done', color: '#00c875' },
  { id: 'working', label: 'Working on it', color: '#fdab3d' },
  { id: 'stuck', label: 'Stuck', color: '#e2445c' },
  { id: 'pending', label: 'Pending', color: '#c4c4c4' },
  { id: 'review', label: 'In Review', color: '#a25ddc' },
];

// --- Job type labels ---
export interface JobTypeLabel {
  id: string;
  label: string;
  color: string;
}

export const DEFAULT_JOB_TYPES: JobTypeLabel[] = [
  { id: 'design', label: 'Design', color: '#ff007f' },
  { id: 'dev', label: 'Development', color: '#0086c0' },
  { id: 'marketing', label: 'Marketing', color: '#9cd326' },
  { id: 'planning', label: 'Planning', color: '#a25ddc' },
  { id: 'research', label: 'Research', color: '#ffcb00' },
];

// --- Board column widths ---
export const DEFAULT_BOARD_COLUMNS: BoardColumns = {
  select: 40,
  item: 450,
  person: 112,
  status: 144,
  type: 144,
  date: 192,
};

// --- Color palette (Monday.com-inspired) ---
export const MONDAY_PALETTE = [
  '#00c875', '#9cd326', '#cab641', '#ffcb00', '#fdab3d', '#ff642e', '#e2445c', '#ff007f',
  '#ff5ac4', '#ffcead', '#a25ddc', '#784bd1', '#579bfc', '#0086c0', '#595ad4', '#037f4c',
  '#00ca72', '#3b85f6', '#175a63', '#333333', '#7f5f3f', '#dff0ff', '#304575', '#7f8c8d',
  '#c4c4c4', '#808080', '#111111', '#b5c0d0',
] as const;

// --- Roles ---
export const ROLE_RANK: Record<Exclude<Role, 'contractor'>, number> = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  admin: 4,
  owner: 5,
};

export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'contractor', label: 'Contractor' },
];

/** Tailwind classes for role badge chips — single source of truth used in
 *  AppHeader and MembersModal so colors are always in sync. */
export const ROLE_BADGE_CLASSES: Record<string, string> = {
  owner:       'bg-purple-500/15 text-purple-500',
  admin:       'bg-yellow-500/15 text-yellow-500',
  editor:      'bg-indigo-500/15 text-indigo-500',
  contributor: 'bg-green-500/15 text-green-500',
  viewer:      'bg-gray-500/15 text-gray-500',
  contractor:  'bg-orange-500/15 text-orange-500',
};

// --- Timeline ---
export const PAST_DAYS = 60;
export const FUTURE_DAYS = 365;
export const TIMELINE_TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS;

// --- Sync ---
export const HYBRID_SYNC_DEBOUNCE_MS = 250;
export const PROJECT_SYNC_DEBOUNCE_MS = 350;
export const PROJECT_STATE_DOC_ID = 'main';
