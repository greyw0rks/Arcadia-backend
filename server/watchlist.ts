// server/watchlist.ts — operator watchlist (observe, don't block).
//
// A watched wallet is NOT prevented from playing. Instead, a flag on a watched wallet raises a louder
// alert so the operator pays closer attention. Managed via the Telegram bot (/watch, /unwatch).
//
// DB-backed with an in-memory mirror for a synchronous check on the alert path. No-op without a DB.

import { query } from "./db";
import type { ChainId } from "../lib/contract";

function addr(a: string): string {
  return a.startsWith("0x") ? a.toLowerCase() : a;
}
function key(player: string, chain: ChainId): string {
  return `${chain}:${addr(player)}`;
}

const WATCHED = new Set<string>();
let hydrated = false;

/** Load the watchlist from DB into memory. Call once after initDb() resolves. */
export async function hydrateWatchlist(): Promise<void> {
  if (hydrated) return;
  const res = await query<{ address: string; chain: string }>("SELECT address, chain FROM watchlist");
  if (res) {
    for (const row of res.rows) WATCHED.add(`${row.chain}:${row.address.toLowerCase()}`);
    console.log(`[watchlist] loaded ${res.rowCount} watched wallets`);
  }
  hydrated = true;
}

/** Synchronous check for the alert path. */
export function isWatched(player: string, chain: ChainId): boolean {
  return WATCHED.has(key(player, chain));
}

export async function watchPlayer(player: string, chain: ChainId, note?: string, by?: string): Promise<void> {
  WATCHED.add(key(player, chain));
  await query(
    `INSERT INTO watchlist (address, chain, note, added_by) VALUES ($1,$2,$3,$4)
     ON CONFLICT (address, chain) DO UPDATE SET note = EXCLUDED.note, added_by = EXCLUDED.added_by`,
    [addr(player), chain, note ?? null, by ?? null]
  );
}

export async function unwatchPlayer(player: string, chain: ChainId): Promise<void> {
  WATCHED.delete(key(player, chain));
  await query(`DELETE FROM watchlist WHERE address = $1 AND chain = $2`, [addr(player), chain]);
}

export interface WatchEntry {
  address: string;
  chain: string;
  note: string | null;
  addedBy: string | null;
  createdAt: number;
}

export async function listWatchlist(): Promise<WatchEntry[]> {
  const res = await query<{ address: string; chain: string; note: string | null; added_by: string | null; created_at: Date }>(
    `SELECT address, chain, note, added_by, created_at FROM watchlist ORDER BY created_at DESC`
  );
  if (!res) return [];
  return res.rows.map((r) => ({
    address: r.address,
    chain: r.chain,
    note: r.note,
    addedBy: r.added_by,
    createdAt: new Date(r.created_at).getTime(),
  }));
}
