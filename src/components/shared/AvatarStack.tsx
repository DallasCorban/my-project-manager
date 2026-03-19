// AvatarStack — overlapping circular avatars for assigned people.
// Shows profile photos when available, otherwise colored initials.

import { useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useProfileCache } from '../../stores/userProfileCache';
import { generateAvatarColor, getInitials } from '../../utils/avatar';

interface AvatarStackProps {
  assignees: string[];
  maxVisible?: number;
  size?: number;
  darkMode: boolean;
}

export function AvatarStack({
  assignees,
  maxVisible = 3,
  size = 26,
  darkMode,
}: AvatarStackProps) {
  const getProfile = useProfileCache((s) => s.getProfile);
  const fetchProfiles = useProfileCache((s) => s.fetchProfiles);

  // Fetch profiles for any UIDs we haven't cached yet
  useEffect(() => {
    if (assignees.length > 0) fetchProfiles(assignees);
  }, [assignees, fetchProfiles]);

  // Empty state
  if (!assignees || assignees.length === 0) {
    return (
      <div
        className={`rounded-full border-2 border-dashed flex items-center justify-center ${
          darkMode ? 'border-gray-600 text-gray-500' : 'border-gray-300 text-gray-400'
        }`}
        style={{ width: size, height: size }}
      >
        <Plus size={size * 0.5} strokeWidth={2} />
      </div>
    );
  }

  const visible = assignees.slice(0, maxVisible);
  const overflow = assignees.length - maxVisible;
  const borderColor = darkMode ? '#1e2243' : '#ffffff';
  const fontSize = Math.max(9, size * 0.38);
  const overlap = Math.round(size * 0.3);

  return (
    <div className="flex items-center" style={{ paddingLeft: overlap }}>
      {visible.map((uid, i) => {
        const profile = getProfile(uid);
        const displayName = profile?.displayName || uid;
        const email = profile?.email || '';
        const avatarUrl = profile?.avatarUrl || '';
        const initials = getInitials(displayName, email);
        const bgColor = generateAvatarColor(uid);

        return (
          <div
            key={uid}
            className="rounded-full flex items-center justify-center shrink-0 overflow-hidden"
            style={{
              width: size,
              height: size,
              marginLeft: -overlap,
              zIndex: i + 1,
              border: `2px solid ${borderColor}`,
              backgroundColor: avatarUrl ? undefined : bgColor,
              position: 'relative',
            }}
            title={profile ? `${displayName}${email ? ` (${email})` : ''}` : uid}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <span
                className="text-white font-medium select-none"
                style={{ fontSize, lineHeight: 1 }}
              >
                {initials}
              </span>
            )}
          </div>
        );
      })}

      {overflow > 0 && (
        <div
          className={`rounded-full flex items-center justify-center shrink-0 font-medium ${
            darkMode ? 'bg-gray-600 text-gray-200' : 'bg-gray-300 text-gray-700'
          }`}
          style={{
            width: size,
            height: size,
            marginLeft: -overlap,
            zIndex: maxVisible + 1,
            border: `2px solid ${borderColor}`,
            fontSize: fontSize * 0.9,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
