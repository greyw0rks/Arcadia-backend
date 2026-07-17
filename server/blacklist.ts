// server/blacklist.ts — operator-controlled wallet blacklist.
//
// A blacklisted wallet cannot start new sessions and cannot have a session settled (the signer
// refuses). This is a MANUAL enforcement lever — set by the operator (e.g. tapping "Blacklist" on a
// Telegram cheat alert) — and is therefore ALWAYS active, independent of ANTICHEAT_ENFORCE (which
// only governs the automatic timing-based blocking).
//
// Backed by Postgres and cached in memory for a fast synchronous check on the hot path. Falls open
// (nobody blacklisted) when there is no DB.

import { query } from "./db";
import type { ChainId } from "../lib/contract";

function addr(a: string): string {
  return a.startsWith("0x") ? a.toLowerCase() : a;
}
function key(player: string, chain: ChainId): string {
  return `${chain}:${addr(player)}`;
}

// In-memory mirror of the blacklist for synchronous checks. Hydrated on boot; updated on writes.
const BLACKLIST = new Set<string>();
let hydrated = false;

/** Load the blacklist from DB into memory. Call once after initDb() resolves. */
export async function hydrateBlacklist(): Promise<void> {
  if (hydrated) return;
  const res = await query<{ address: string; chain: string }>(
    "SELECT address, chain FROM blacklist"
  );
  if (res) {
    for (const row of res.rows) BLACKLIST.add(`${row.chain}:${row.address.toLowerCase()}`);
    console.log(`[blacklist] loaded ${res.rowCount} blacklisted wallets`);
  }
  hydrated = true;
}

/** Synchronous check for the hot path (session start / settle). */
export function isBlacklisted(player: string, chain: ChainId): boolean {
  return BLACKLIST.has(key(player, chain));
}

/** Add a wallet to the blacklist. `reason`/`by` are stored for the audit trail. */
export async function blacklistPlayer(
  player: string,
  chain: ChainId,
  reason?: string,
  sessionId?: string,
  by?: string
): Promise<void> {
  BLACKLIST.add(key(player, chain));
  await query(
    `INSERT INTO blacklist (address, chain, reason, session_id, added_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (address, chain) DO UPDATE SET reason = EXCLUDED.reason, added_by = EXCLUDED.added_by`,
    [addr(player), chain, reason ?? null, sessionId ?? null, by ?? null]
  );
}

/** Remove a wallet from the blacklist. */
export async function unblacklistPlayer(player: string, chain: ChainId): Promise<void> {
  BLACKLIST.delete(key(player, chain));
  await query(`DELETE FROM blacklist WHERE address = $1 AND chain = $2`, [addr(player), chain]);
}
