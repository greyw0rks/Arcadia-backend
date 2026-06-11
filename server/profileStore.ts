// Best-effort in-memory overlay for player-chosen username + avatar. There is no database, so these
// live only in the (long-lived) process and reset on restart — the authoritative game STATS still
// come from on-chain (see server/leaderboard.ts); only the cosmetic name/avatar is volatile.

export interface ProfileOverlay {
  username: string | null;
  avatar: string | null;
}

const OVERLAYS = new Map<string, ProfileOverlay>();

/** EVM addresses are case-insensitive (lowercase); Stacks principals are case-sensitive (keep as-is). */
function key(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

export function getProfileOverlay(address: string): ProfileOverlay | undefined {
  return OVERLAYS.get(key(address));
}

export function setProfileOverlay(address: string, overlay: ProfileOverlay): void {
  OVERLAYS.set(key(address), {
    username: overlay.username?.trim() || null,
    avatar: overlay.avatar || null,
  });
}
