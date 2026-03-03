/** Generate a unique ID with an optional prefix */
export const generateId = (prefix = ''): string => {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}${ts}${rand}` : `${ts}${rand}`;
};

/** Generate a share/invite token */
export const createShareToken = (): string => {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
};
