import { Archive, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';

interface ArchivedBannerProps {
  onExit: () => void;
}

export default function ArchivedBanner({ onExit }: ArchivedBannerProps) {
  const darkMode = useUIStore((s) => s.darkMode);

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b shrink-0 ${
        darkMode
          ? 'bg-amber-900/20 border-amber-700/30 text-amber-300'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}
    >
      <Archive size={14} className="shrink-0" />
      <span className="flex-1">Viewing archived content (read-only)</span>
      <button
        onClick={onExit}
        className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
          darkMode
            ? 'hover:bg-amber-800/30 text-amber-400'
            : 'hover:bg-amber-100 text-amber-600'
        }`}
      >
        <X size={12} /> Exit preview
      </button>
    </div>
  );
}
