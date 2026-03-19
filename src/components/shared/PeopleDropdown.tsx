// PeopleDropdown — multi-select member picker with search.
// Portal-rendered, centered on anchor with triangle pointer.
// Follows the same positioning pattern as StatusDropdown.

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, Search } from 'lucide-react';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useUIStore } from '../../stores/uiStore';
import { useMemberStore } from '../../stores/memberStore';
import { useProfileCache } from '../../stores/userProfileCache';
import { generateAvatarColor, getInitials } from '../../utils/avatar';

interface PeopleDropdownProps {
  assignees: string[];
  projectId: string;
  onToggleAssignee: (uid: string) => void;
  darkMode: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function PeopleDropdown({
  assignees,
  projectId,
  onToggleAssignee,
  darkMode,
  anchorRef,
}: PeopleDropdownProps) {
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triangleRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closePeopleMenu = useCallback(() => {
    useUIStore.getState().closePeopleMenu();
  }, []);

  useClickOutside(dropdownRef, closePeopleMenu, true);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePeopleMenu();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closePeopleMenu]);

  // Auto-focus search on open
  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  // ─── Position: center on anchor with clamping ───
  useLayoutEffect(() => {
    if (!anchorRef?.current || !dropdownRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const dd = dropdownRef.current;
    const ddW = dd.offsetWidth;
    const anchorCenterX = anchor.left + anchor.width / 2;
    let left = anchorCenterX - ddW / 2;
    const margin = 8;
    if (left < margin) left = margin;
    if (left + ddW > window.innerWidth - margin) left = window.innerWidth - margin - ddW;
    const top = anchor.bottom + 2;
    dd.style.top = `${top}px`;
    dd.style.left = `${left}px`;
    if (triangleRef.current) {
      triangleRef.current.style.left = `${anchorCenterX - left}px`;
    }
  });

  // ─── Members ───
  const members = useMemberStore((s) => s.membersByProject[projectId] || []);
  const getProfile = useProfileCache((s) => s.getProfile);
  const fetchProfiles = useProfileCache((s) => s.fetchProfiles);

  useEffect(() => {
    const uids = members.map((m) => m.uid);
    if (uids.length > 0) fetchProfiles(uids);
  }, [members, fetchProfiles]);

  // Filter by search
  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const profile = getProfile(m.uid);
    const name = (profile?.displayName || '').toLowerCase();
    const email = (m.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const bgColor = darkMode ? '#161a33' : '#ffffff';
  const borderColor = darkMode ? '#323652' : '#d1d5db';

  const dropdown = (
    <div
      ref={dropdownRef}
      className={`rounded-xl shadow-2xl border overflow-visible ${
        darkMode ? 'bg-[#161a33] border-[#323652]' : 'bg-white border-gray-300'
      }`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        width: 260,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Triangle pointer */}
      <div
        ref={triangleRef}
        style={{
          position: 'absolute',
          top: -6,
          left: 0,
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderBottom: `7px solid ${borderColor}`,
          zIndex: 1,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 1.5,
            left: -6,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderBottom: `6px solid ${bgColor}`,
          }}
        />
      </div>

      {/* Search field */}
      <div className="p-2 pb-1">
        <div
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${
            darkMode
              ? 'bg-[#252a4a] text-gray-300 placeholder-gray-500'
              : 'bg-gray-100 text-gray-700 placeholder-gray-400'
          }`}
        >
          <Search size={13} className="shrink-0 opacity-50" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            className="bg-transparent outline-none w-full text-xs"
          />
        </div>
      </div>

      {/* Member list */}
      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
        {filtered.length === 0 ? (
          <div
            className={`px-3 py-4 text-xs text-center ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            {members.length === 0
              ? 'No members yet. Invite members to assign them.'
              : 'No members found'}
          </div>
        ) : (
          filtered.map((member) => {
            const profile = getProfile(member.uid);
            const displayName = profile?.displayName || '';
            const email = member.email || '';
            const avatarUrl = profile?.avatarUrl || '';
            const initials = getInitials(displayName, email);
            const bgCol = generateAvatarColor(member.uid);
            const isAssigned = assignees.includes(member.uid);

            return (
              <button
                key={member.uid}
                onClick={() => onToggleAssignee(member.uid)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  darkMode
                    ? 'hover:bg-[#252a4a] text-gray-200'
                    : 'hover:bg-gray-50 text-gray-800'
                }`}
              >
                {/* Avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ backgroundColor: avatarUrl ? undefined : bgCol }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName || email}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <span className="text-white text-[10px] font-medium select-none">
                      {initials}
                    </span>
                  )}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {displayName || email}
                  </div>
                  {displayName && email && (
                    <div
                      className={`text-[10px] truncate ${
                        darkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}
                    >
                      {email}
                    </div>
                  )}
                </div>

                {/* Checkmark */}
                {isAssigned && (
                  <Check size={15} className="shrink-0 text-blue-500" strokeWidth={2.5} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return createPortal(dropdown, document.body);
}
