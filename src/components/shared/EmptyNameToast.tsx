// Toast that slides in from the top when the user tries to save an empty name.
// Auto-dismisses after 6 seconds with a fade-out; also has an X to dismiss immediately.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const FADE_MS = 300;
const AUTO_DISMISS_MS = 6000;

export function EmptyNameToast() {
  const visible = useUIStore((s) => s.emptyNameToast);
  const hide = useUIStore((s) => s.hideEmptyNameToast);
  const [fading, setFading] = useState(false);

  // Auto-dismiss with fade-out
  useEffect(() => {
    if (!visible) return;
    setFading(false); // reset in case of rapid re-trigger
    const fadeTimer = setTimeout(() => setFading(true), AUTO_DISMISS_MS - FADE_MS);
    const hideTimer = setTimeout(hide, AUTO_DISMISS_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [visible, hide]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 px-5 py-3 rounded-xl bg-red-500 text-white shadow-2xl select-none"
      style={{
        animation: fading
          ? `fadeOut ${FADE_MS}ms ease-in forwards`
          : 'slideDown 0.25s ease-out',
      }}
      role="alert"
    >
      <span className="text-sm font-medium">Name can&apos;t be empty</span>
      <button
        onClick={hide}
        className="ml-1 rounded p-0.5 hover:bg-white/20 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
