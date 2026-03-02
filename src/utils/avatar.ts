/**
 * Avatar utilities — deterministic colour + initials from user identity.
 * Shared between AuthModal, AppHeader, member lists, etc.
 */

/** Warm/cool palette that looks good on white and dark backgrounds */
const AVATAR_PALETTE = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
] as const;

/**
 * Generate a deterministic avatar background colour from any string seed
 * (display name, email, or uid).  Same seed always → same colour.
 */
export function generateAvatarColor(seed: string): string {
  if (!seed) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/**
 * Derive 1–2 character initials from a display name or email.
 * - "Alex Smith"   → "AS"
 * - "Alex"         → "AL"
 * - "alex@foo.com" → "A"
 */
export function getInitials(displayName: string, email: string): string {
  const name = displayName.trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length === 1) return name.slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (email || '?').charAt(0).toUpperCase();
}
