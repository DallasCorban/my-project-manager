export const colors = {
  // Semantic
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
  },
  danger: {
    50: '#fef2f2',
    500: '#ef4444',
    600: '#dc2626',
  },
  success: {
    50: '#f0fdf4',
    500: '#22c55e',
    600: '#16a34a',
  },
  warning: {
    50: '#fffbeb',
    500: '#f59e0b',
    600: '#d97706',
  },

  // Brand
  mondayBlue: '#0073ea',

  // Light mode surfaces
  light: {
    bg: '#eceff8',
    surface: '#ffffff',
    surfaceHover: '#f9fafc',
    surfaceActive: '#f0f2f8',
    border: '#d0d4e4',
    borderSubtle: '#eceff8',
    text: '#323338',
    textMuted: '#676879',
    textFaint: '#9ca3af',
  },

  // Dark mode surfaces
  dark: {
    bg: '#181b34',
    surface: '#1c213e',
    surfaceHover: '#202336',
    surfaceActive: '#262940',
    border: '#2b2c32',
    borderSubtle: '#232538',
    text: '#e5e7eb',
    textMuted: '#9ca3af',
    textFaint: '#6b7280',
  },
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '48px',
} as const;

export const radii = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
} as const;

export const zIndex = {
  stickyHeader: 80,
  datePicker: 110,
  settingsMenu: 130,
  loadingOverlay: 140,
  labelEditor: 150,
  updatesPanel: 160,
  selectionToolbar: 200,
  membersModal: 220,
  authModal: 300,
} as const;
