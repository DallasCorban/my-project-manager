// useClickOutside — close dropdowns/popups when clicking outside.

import { useEffect, type RefObject } from 'react';

/**
 * Hook that detects clicks outside the referenced element and calls the handler.
 * Commonly used for dropdown menus, modals, and popups.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void,
  enabled: boolean = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const listener = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      handler();
    };

    // Use mousedown so the menu closes before the click event propagates
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler, enabled]);
}
