// server/profileStore.ts — player username + avatar overlay
//
// In-memory Map is the hot path. PostgreSQL (via server/db.ts) is the persistence layer:
//   - On startup, all profiles are loaded from DB into the Map.
//   - On write, changes are flushed to DB asynchronously (fire-and-forget).
//
// When DATABASE_URL is absent, behaviour is unchanged from the original (in-memory only).

import { query } from "./db";

export interface ProfileOverlay {
  username: string | null;
  avatar: string | null;
}

const OVERLAYS = new Map<string, ProfileOverlay>();
let hydrated = false;

function key(address: string): string {
  return address.toLowerCase();
}

// ---------------------------------------------------------------------------
// Hydration — call once after initDb() resolves
// ---------------------------------------------------------------------------

export async function hydrateProfiles(): Promise<void> {
  if (hydrated) return;
  const result = await query<{ address: string; username: string | null; avatar: string | null }>(
    "SELECT address, username, avatar FROM player_profiles"
  );
  if (result) {
    for (const row of result.rows) {
      OVERLAYS.set(row.address.toLowerCase(), { username: row.username, avatar: row.avatar });
    }
    console.log(`[profileStore] loaded ${result.rowCount} profiles from DB`);
  }
  hydrated = true;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getProfileOverlay(address: string): ProfileOverlay | undefined {
  return OVERLAYS.get(key(address));
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** Merge `patch` into the existing overlay (missing keys are preserved). */
export function setProfileOverlay(address: string, patch: Partial<ProfileOverlay>): void {
  const k = key(address);
  const existing = OVERLAYS.get(k) ?? { username: null, avatar: null };
  const next: ProfileOverlay = {
    username: patch.username !== undefined ? (patch.username?.trim() || null) : existing.username,
    avatar: patch.avatar !== undefined ? (patch.avatar || null) : existing.avatar,
  };
  OVERLAYS.set(k, next);

  // Fire-and-forget DB write
  void query(
    `INSERT INTO player_profiles (address, username, avatar, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (address) DO UPDATE
       SET username   = EXCLUDED.username,
           avatar     = EXCLUDED.avatar,
           updated_at = NOW()`,
    [k, next.username, next.avatar]
  );
}
