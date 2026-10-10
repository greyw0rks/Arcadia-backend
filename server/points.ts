// server/points.ts — per-wallet Arcade XP ("points") accumulator.
//
// XP is earned by completing free-play games (PLAY_MODE=free; see server/playMode.ts). The in-memory
// Map is the hot path; PostgreSQL (server/db.ts) is the persistence layer: hydrated into the Map at
// boot, written fire-and-forget on each award. Without DATABASE_URL it degrades to in-memory only,
// exactly like profileStore / gameHistory.
//
// This is the only lifetime cumulative per-wallet counter in the system. It is deliberately generic
// ("Arcade Points"/"XP") — the UI never ascribes any external value to it.

import { query } from "./db";
import type { ChainId } from "../lib/contract";

export interface PointsRow {
  points: number;
  games: number;
}

// key: `${chain}:${address.toLowerCase()}`
const POINTS = new Map<string, PointsRow>();
let hydrated = false;

function key(address: string, chain: ChainId): string {
  return `${chain}:${address.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// XP formula — per correct answer plus a flat completion bonus. Both tunable
// per deploy via XP_PER_CORRECT / XP_COMPLETION_BONUS, no code change needed.
// ---------------------------------------------------------------------------

export function xpPerCorrect(): number {
  const n = Number(process.env.XP_PER_CORRECT);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
}

export function xpCompletionBonus(): number {
  const n = Number(process.env.XP_COMPLETION_BONUS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 50;
}

/** XP earned for a completed game with `correct` correct answers. */
export function xpForGame(correct: number): number {
  return xpPerCorrect() * Math.max(0, correct) + xpCompletionBonus();
}

// ---------------------------------------------------------------------------
// Hydration — call once after initDb() resolves (see server/bootstrap.ts)
// ---------------------------------------------------------------------------

export async function hydratePoints(): Promise<void> {
  if (hydrated) return;
  const result = await query<{ address: string; chain: string; points: string; games: string }>(
    "SELECT address, chain, points, games FROM player_points"
  );
  if (result) {
    for (const row of result.rows) {
      POINTS.set(`${row.chain}:${row.address.toLowerCase()}`, {
        points: Number(row.points),
        games: Number(row.games),
      });
    }
    console.log(`[points] loaded ${result.rowCount} XP balances from DB`);
  }
  hydrated = true;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getPoints(address: string, chain: ChainId = "celo"): PointsRow {
  return POINTS.get(key(address, chain)) ?? { points: 0, games: 0 };
}

// ---------------------------------------------------------------------------
// Write — atomic increment, mirroring the cooldown upsert pattern
// ---------------------------------------------------------------------------

/** Add `xp` to a wallet's balance and count one completed game. Returns the new in-memory balance. */
export function awardPoints(address: string, chain: ChainId, xp: number): PointsRow {
  const amount = Math.max(0, Math.floor(xp));
  const k = key(address, chain);
  const cur = POINTS.get(k) ?? { points: 0, games: 0 };
  const next: PointsRow = { points: cur.points + amount, games: cur.games + 1 };
  POINTS.set(k, next);
  // Fire-and-forget atomic increment — the DB is the source of truth, never the in-memory value.
  void query(
    `INSERT INTO player_points (address, chain, points, games, updated_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (address, chain)
     DO UPDATE SET points     = player_points.points + $3,
                   games      = player_points.games + 1,
                   updated_at = NOW()`,
    [address.toLowerCase(), chain, amount]
  );
  return next;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface PointsLeader {
  rank: number;
  address: string;
  points: number;
  games: number;
}

/** Top wallets by XP. Reads the DB when available, else falls back to the in-memory Map. */
export async function topPoints(limit = 50): Promise<PointsLeader[]> {
  const result = await query<{ address: string; points: string; games: string }>(
    `SELECT address, points, games FROM player_points ORDER BY points DESC, updated_at ASC LIMIT $1`,
    [limit]
  );
  const rows = result
    ? result.rows.map((r) => ({ address: r.address, points: Number(r.points), games: Number(r.games) }))
    : [...POINTS.entries()]
        .map(([k, v]) => ({ address: k.split(":")[1], points: v.points, games: v.games }))
        .sort((a, b) => b.points - a.points)
        .slice(0, limit);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
