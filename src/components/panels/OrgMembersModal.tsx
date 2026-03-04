// OrgMembersModal — organisation member management modal.
// Shows current org members, roles, and allows admins to invite new members.

import { useState } from 'react';
import { X, Users, Shield, Crown, UserPlus } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useOrgStore } from '../../stores/orgStore';
import { useAuthStore } from '../../stores/authStore';
import { inviteToOrg, removeOrgMember } from '../../services/firebase/orgSync';
import type { OrgRole } from '../../types/org';

const ORG_ROLE_OPTIONS: { value: OrgRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Admin', description: 'Can manage members, workspaces, and all org boards.' },
  { value: 'member', label: 'Member', description: 'Can access all org boards with contributor permissions.' },
  { value: 'guest', label: 'Guest', description: 'Read-only access to org boards.' },
];

const ORG_ROLE_BADGE: Record<string, string> = {
  owner: 'bg-purple-500/15 text-purple-500',
  admin: 'bg-yellow-500/15 text-yellow-500',
  member: 'bg-blue-500/15 text-blue-500',
  guest: 'bg-gray-500/15 text-gray-500',
};

const ORG_ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  guest: 1,
};

interface OrgMembersModalProps {
  orgId: string;
  orgName: string;
}

export function OrgMembersModal({ orgId, orgName }: OrgMembersModalProps) {
  const darkMode = useUIStore((s) => s.darkMode);
  const isOpen = useUIStore((s) => s.orgMembersModalOpen);
  const setOpen = useUIStore((s) => s.setOrgMembersModalOpen);

  const members = useOrgStore((s) => s.activeOrgMembers);
  const user = useAuthStore((s) => s.user);

  // Check if current user is admin/owner
  const selfMember = members.find((m) => m.uid === user?.uid);
  const isAdmin = selfMember?.orgRole === 'owner' || selfMember?.orgRole === 'admin';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  if (!isOpen) return null;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      setInviteError('Enter an email address.');
      return;
    }
    if (!user || user.isAnonymous) return;
    setInviteError('');
    setInviteSuccess('');
    setInviteBusy(true);
    try {
      await inviteToOrg(orgId, inviteEmail.trim(), inviteRole, user.uid);
      setInviteSuccess(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail('');
    } catch (err) {
      setInviteError((err as Error)?.message || 'Failed to send invite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleRemove = async (uid: string) => {
    if (!confirm('Remove this member from the team?')) return;
    await removeOrgMember(orgId, uid);
  };

  const sortedMembers = [...members].sort(
    (a, b) => (ORG_ROLE_RANK[b.orgRole] || 0) - (ORG_ROLE_RANK[a.orgRole] || 0),
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
      <div
        className={`w-full max-w-lg rounded-lg shadow-xl ${
          darkMode ? 'bg-[#1c213e] text-gray-200' : 'bg-white text-gray-800'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${
          darkMode ? 'border-[#323652]' : 'border-gray-300'
        }`}>
          <div className="flex items-center gap-2">
            <Users size={18} className="text-blue-500" />
            <div>
              <h2 className="text-base font-semibold">Team Members</h2>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {orgName}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className={`p-1 rounded transition-colors ${
              darkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Invite section (admin/owner only) */}
        {isAdmin && (
          <div className={`px-5 py-3 border-b ${
            darkMode ? 'border-[#323652]' : 'border-gray-300'
          }`}>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Invite by email..."
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleInvite(); }}
                disabled={inviteBusy}
                className={`flex-1 px-3 py-2 rounded text-sm border ${
                  darkMode
                    ? 'bg-[#181b34] border-[#323652] text-gray-200 placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                } disabled:opacity-60`}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                disabled={inviteBusy}
                className={`px-2 py-2 rounded text-sm border ${
                  darkMode
                    ? 'bg-[#181b34] border-[#323652] text-gray-200'
                    : 'bg-white border-gray-300 text-gray-800'
                } disabled:opacity-60`}
              >
                {ORG_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => void handleInvite()}
                disabled={inviteBusy}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                <UserPlus size={14} className="inline mr-1" />
                {inviteBusy ? 'Sending...' : 'Invite'}
              </button>
            </div>
            {/* Role description */}
            {!inviteError && !inviteSuccess && (
              <p className={`mt-1.5 text-[11px] leading-relaxed ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <span className={`font-semibold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {ORG_ROLE_OPTIONS.find((o) => o.value === inviteRole)?.label}:
                </span>{' '}
                {ORG_ROLE_OPTIONS.find((o) => o.value === inviteRole)?.description}
              </p>
            )}
            {inviteError && (
              <p className="mt-1.5 text-xs text-red-500">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="mt-1.5 text-xs text-green-500">{inviteSuccess}</p>
            )}
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
                <div
                  key={member.uid}
                  className={`flex items-center gap-3 px-3 py-2 rounded ${
                    darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-medium shrink-0">
                    {(member.email || '?').charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      {member.email || 'Unknown'}
                      {member.uid === user?.uid && (
                        <span className={`ml-1.5 text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>(you)</span>
                      )}
                    </div>
                  </div>

                  {/* Role badge */}
                  <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                    ORG_ROLE_BADGE[member.orgRole] || ORG_ROLE_BADGE.guest
                  }`}>
                    {member.orgRole === 'owner' && <Crown size={10} />}
                    {member.orgRole === 'admin' && <Shield size={10} />}
                    <span className="capitalize">{member.orgRole}</span>
                  </div>

                  {/* Remove button (admin only, can't remove owners or self) */}
                  {isAdmin && member.orgRole !== 'owner' && member.uid !== user?.uid && (
                    <button
                      onClick={() => void handleRemove(member.uid)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        darkMode
                          ? 'text-red-400 hover:bg-red-500/15'
                          : 'text-red-500 hover:bg-red-50'
                      }`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-5 py-3 border-t text-xs ${
          darkMode ? 'border-[#323652] text-gray-500' : 'border-gray-300 text-gray-400'
        }`}>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
