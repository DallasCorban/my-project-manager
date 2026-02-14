// MembersModal — project member management modal.
// Shows current members, roles, and allows admins to manage access.

import { useState } from 'react';
import { X, Users, Shield, Clock } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useMemberStore } from '../../stores/memberStore';
import { getProjectPermissions } from '../../stores/memberStore';
import {
  getMemberEffectiveRole,
  getMemberAccessUntil,
  isMemberActive,
} from '../../services/permissions';
import { ROLE_OPTIONS } from '../../config/constants';
import type { Member } from '../../types/member';

interface MembersModalProps {
  projectId: string;
  projectName: string;
}

export function MembersModal({ projectId, projectName }: MembersModalProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const membersModalOpen = useUIStore((s) => s.membersModalOpen);
  const setMembersModalOpen = useUIStore((s) => s.setMembersModalOpen);

  const members = useMemberStore((s) => s.membersByProject[projectId] || []);
  const permissions = getProjectPermissions(projectId);
  const canManage = permissions.canManageMembers;

  const [_inviteEmail, setInviteEmail] = useState('');

  if (!membersModalOpen) return null;

  const sortedMembers = [...members].sort((a, b) => {
    // Owners first, then by role rank desc
    const roleOrder: Record<string, number> = {
      owner: 5,
      admin: 4,
      editor: 3,
      contributor: 2,
      viewer: 1,
      contractor: 0,
    };
    return (roleOrder[b.role] || 0) - (roleOrder[a.role] || 0);
  });

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
      <div
        className={`w-full max-w-lg rounded-lg shadow-xl ${
          darkMode ? 'bg-[#1c213e] text-gray-200' : 'bg-white text-gray-800'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${
          darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-500" />
            <div>
              <h2 className="text-base font-semibold">Members</h2>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {projectName}
              </p>
            </div>
          </div>
          <button
            onClick={() => setMembersModalOpen(false)}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Invite section (admin only) */}
        {canManage && (
          <div className={`px-5 py-3 border-b ${
            darkMode ? 'border-[#2b2c32]' : 'border-gray-200'
          }`}>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Invite by email..."
                onChange={(e) => setInviteEmail(e.target.value)}
                className={`flex-1 px-3 py-2 rounded text-sm border ${
                  darkMode
                    ? 'bg-[#181b34] border-[#2b2c32] text-gray-200 placeholder-gray-500'
                    : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
                }`}
              />
              <button
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
              >
                Invite
              </button>
            </div>
          </div>
        )}

        {/* Members list */}
        <div className="px-5 py-3 max-h-80 overflow-y-auto">
          {sortedMembers.length === 0 ? (
            <p className={`text-sm text-center py-4 ${
              darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              No members yet
            </p>
          ) : (
            <div className="space-y-2">
              {sortedMembers.map((member) => (
                <MemberRow
                  key={member.id || member.uid}
                  member={member}
                  canManage={canManage}
                  darkMode={darkMode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t text-xs ${
          darkMode ? 'border-[#2b2c32] text-gray-500' : 'border-gray-200 text-gray-400'
        }`}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}

// --- Member row ---

function MemberRow({
  member,
  canManage,
  darkMode,
}: {
  member: Member;
  canManage: boolean;
  darkMode: boolean;
}) {
  const effectiveRole = getMemberEffectiveRole(member);
  const active = isMemberActive(member);
  const accessUntil = getMemberAccessUntil(member);
  const isContractor = member.role === 'contractor';

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded ${
        darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
      } ${!active ? 'opacity-50' : ''}`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium shrink-0">
        {(member.email || '?').charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
          {member.email || 'Unknown'}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] capitalize ${
            darkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>
            {effectiveRole}
          </span>
          {isContractor && (
            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <Clock size={10} />
              Contractor
            </span>
          )}
          {!active && (
            <span className="text-[10px] text-red-400">Expired</span>
          )}
          {isContractor && accessUntil && (
            <span className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
              until {accessUntil.toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Role badge */}
      <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
        member.role === 'owner'
          ? 'bg-amber-500/10 text-amber-500'
          : member.role === 'admin'
            ? 'bg-purple-500/10 text-purple-500'
            : darkMode
              ? 'bg-white/5 text-gray-400'
              : 'bg-gray-100 text-gray-500'
      }`}>
        {member.role === 'owner' && <Shield size={10} />}
        <span className="capitalize">{member.role}</span>
      </div>

      {/* Role change (admin only, not for owners) */}
      {canManage && member.role !== 'owner' && (
        <select
          value={effectiveRole}
          onChange={() => {
            // TODO: implement role change via Firestore
          }}
          className={`text-xs rounded px-1 py-0.5 border ${
            darkMode
              ? 'bg-[#181b34] text-gray-300 border-[#2b2c32]'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          {ROLE_OPTIONS.filter((o) => o.value !== 'owner').map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
