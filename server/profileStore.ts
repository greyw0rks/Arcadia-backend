// Best-effort in-memory overlay for player-chosen username + avatar. There is no database, so these
// live only in the (long-lived) process and reset on restart — the authoritative game STATS still
// come from on-chain (see server/leaderboard.ts); only the cosmetic name/avatar is volatile.

export interface ProfileOverlay {
  username: string | null;
  avatar: string | null;
  linkedStacksAddress: string | null; // optional cross-chain link (Celo → Stacks)
}

const OVERLAYS = new Map<string, ProfileOverlay>();

/** EVM addresses are case-insensitive (lowercase); Stacks principals are case-sensitive (keep as-is). */
function key(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

export function getProfileOverlay(address: string): ProfileOverlay | undefined {
  return OVERLAYS.get(key(address));
}

/** Merge `patch` into the existing overlay (missing keys are preserved). */
export function setProfileOverlay(address: string, patch: Partial<ProfileOverlay>): void {
  const existing = OVERLAYS.get(key(address)) ?? { username: null, avatar: null, linkedStacksAddress: null };
  OVERLAYS.set(key(address), {
    username: patch.username !== undefined ? (patch.username?.trim() || null) : existing.username,
    avatar: patch.avatar !== undefined ? (patch.avatar || null) : existing.avatar,
    linkedStacksAddress: patch.linkedStacksAddress !== undefined ? (patch.linkedStacksAddress || null) : existing.linkedStacksAddress,
  });
}
