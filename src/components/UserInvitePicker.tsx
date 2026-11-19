import React, { useMemo, useState } from 'react';
import { Search, UserPlus, X, Check, Clock, Shield } from 'lucide-react';
import { StudentAccount } from '../types';

interface UserInvitePickerProps {
  allUsers: StudentAccount[];
  currentUsername: string;
  existingMemberUsernames: string[];
  pendingInviteUsernames?: string[];
  selectedUsers: StudentAccount[];
  onAddUser: (user: StudentAccount) => void;
  onRemoveUser: (username: string) => void;
  label?: string;
}

export const UserInvitePicker: React.FC<UserInvitePickerProps> = ({
  allUsers,
  currentUsername,
  existingMemberUsernames,
  pendingInviteUsernames = [],
  selectedUsers,
  onAddUser,
  onRemoveUser,
  label = 'Invitar compañeros (busca usuarios registrados)',
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const normalizedExisting = useMemo(
    () => new Set(existingMemberUsernames.map((u) => u.toLowerCase().trim())),
    [existingMemberUsernames]
  );
  const normalizedPending = useMemo(
    () => new Set(pendingInviteUsernames.map((u) => u.toLowerCase().trim())),
    [pendingInviteUsernames]
  );
  const normalizedSelected = useMemo(
    () => new Set(selectedUsers.map((u) => u.username.toLowerCase().trim())),
    [selectedUsers]
  );

  // Deduplicate users by username (preferring entries with firebaseUid)
  const uniqueRegisteredUsers = useMemo(() => {
    const map = new Map<string, StudentAccount>();
    for (const u of allUsers) {
      const key = u.username.toLowerCase().trim();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing || (u.firebaseUid && !existing.firebaseUid)) {
        map.set(key, u);
      }
    }
    return Array.from(map.values());
  }, [allUsers]);

  const matchingUsers = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    const currentLower = currentUsername.toLowerCase().trim();

    return uniqueRegisteredUsers
      .filter((u) => {
        const uname = u.username.toLowerCase().trim();
        if (uname === currentLower) return false;
        if (normalizedExisting.has(uname)) return false;
        if (normalizedPending.has(uname)) return false;
        if (normalizedSelected.has(uname)) return false;
        if (!q) return true;
        return (
          uname.includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [
    query,
    uniqueRegisteredUsers,
    currentUsername,
    normalizedExisting,
    normalizedPending,
    normalizedSelected,
  ]);

  const trimmedQuery = query.trim();

  return (
    <div className="space-y-2.5">
      <label className="block font-mono text-[11px] uppercase text-[#A1A1B2]">{label}</label>

      {/* Search Box */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-[#7E7E8E] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onFocus={() => setIsFocused(true)}
          onBlur={() => window.setTimeout(() => setIsFocused(false), 180)}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Escribe un nombre o @usuario registrado..."
          className="w-full h-10 pl-9 pr-3 bg-[#09090B] border border-[#2A2A35] text-xs text-white focus:outline-none focus:border-white"
        />

        {/* Live Dropdown of Real Registered Users */}
        {(isFocused || trimmedQuery.length > 0) && (
          <div className="absolute left-0 right-0 top-full mt-1 z-30 border border-[#2E2E3A] bg-[#0B0B0F] shadow-2xl max-h-52 overflow-y-auto">
            {matchingUsers.length > 0 ? (
              <div className="divide-y divide-[#1D1D25]">
                {matchingUsers.map((u) => (
                  <button
                    key={u.username}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAddUser(u);
                      setQuery('');
                    }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-[#16161F] flex items-center justify-between gap-3 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {u.displayName}{' '}
                        <span className="font-mono text-[#60A5FA] font-normal">@{u.username}</span>
                      </p>
                      <p className="font-mono text-[10px] text-[#7E7E8E] truncate">{u.role}</p>
                    </div>
                    <span className="px-2 py-1 border border-[#3B82F6]/40 bg-[#3B82F6]/10 font-mono text-[10px] text-[#60A5FA] inline-flex items-center gap-1 shrink-0">
                      <UserPlus className="w-3 h-3" />
                      Invitar
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3.5 py-3 text-xs text-[#8E8E9E]">
                {trimmedQuery
                  ? `No hay ningún usuario registrado disponible que coincida con «${trimmedQuery}».`
                  : 'No hay más usuarios registrados disponibles para invitar. Pide a tus compañeros que creen su cuenta y conecten Google.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Users to Send Invitations To */}
      {selectedUsers.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="font-mono text-[10px] uppercase text-[#60A5FA] block">
            SE ENVIARÁ INVITACIÓN A ({selectedUsers.length}):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {selectedUsers.map((u) => (
              <span
                key={u.username}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-[#3B82F6]/50 bg-[#3B82F6]/15 font-mono text-[11px] text-white"
              >
                <Check className="w-3 h-3 text-[#60A5FA]" />
                <span>@{u.username}</span>
                <button
                  type="button"
                  onClick={() => onRemoveUser(u.username)}
                  className="text-[#9E9EAE] hover:text-white cursor-pointer"
                  aria-label={`Quitar a ${u.username}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Existing Members & Pending Invites Summary */}
      {(existingMemberUsernames.length > 0 || pendingInviteUsernames.length > 0) && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {existingMemberUsernames.map((uname) => (
            <span
              key={`member_${uname}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 border border-[#2A2A35] bg-[#14141A] font-mono text-[10px] text-[#C4C4D0]"
            >
              <Shield className="w-2.5 h-2.5 text-emerald-400" />@{uname}
            </span>
          ))}
          {pendingInviteUsernames.map((uname) => (
            <span
              key={`pending_${uname}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-300"
            >
              <Clock className="w-2.5 h-2.5" />@{uname} (pendiente)
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
