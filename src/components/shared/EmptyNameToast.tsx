// Toast that slides in from the top when the user tries to save an empty name.
// Auto-dismisses after 3 seconds; also has an X to dismiss immediately.

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

const AUTO_DISMISS_MS = 3000;

export function EmptyNameToast() {
  const visible = useUIStore((s) => s.emptyNameToast);
  const hide = useUIStore((s) => s.hideEmptyNameToast);

  // Auto-dismiss
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(hide, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [visible, hide]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 px-5 py-3 rounded-xl bg-red-500 text-white shadow-2xl select-none"
      style={{ animation: 'slideDown 0.25s ease-out' }}
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
