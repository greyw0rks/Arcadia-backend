// server/gameHistory.ts — completed game records
//
// Supplements the on-chain leaderboard scan (server/leaderboard.ts) so stats appear immediately
// after a game is finalized — without waiting for the blockchain event indexer.
//
// Persistence layer: PostgreSQL (via server/db.ts).
//   - On startup, recent history is loaded from DB into memory.
//   - On write, records are flushed to DB asynchronously (fire-and-forget).
//
// When DATABASE_URL is absent, behaviour is unchanged from the original (in-memory only).

import { query } from "./db";

export interface HistoryRecord {
  sessionId: string;
  player: string;
  chain: "celo";
  unit: string;
  stake: number;
  multiplierBp: number;
  payout: number;
  won: boolean;
  difficulty?: number; // 0..1 (stake / maxStake)
  approxTs?: number;   // wall-clock ms at settlement
}

const bySession = new Map<string, HistoryRecord>();
const byPlayer = new Map<string, string[]>(); // player → sessionId[]
let hydrated = false;

function playerKey(player: string): string {
  return player.startsWith("0x") ? player.toLowerCase() : player;
}

// ---------------------------------------------------------------------------
// Hydration — call once after initDb() resolves
// ---------------------------------------------------------------------------

export async function hydrateGameHistory(): Promise<void> {
  if (hydrated) return;
  const result = await query<{
    session_id: string;
    player: string;
    chain: string;
    unit: string;
    stake: string;
    multiplier_bp: number;
    payout: string;
    won: boolean;
    difficulty: string | null;
    created_at: Date;
  }>(
    // Load the most-recent 10 000 records — enough for leaderboard supplementation without
    // unbounded memory growth. The on-chain scan covers everything older.
    `SELECT session_id, player, chain, unit, stake, multiplier_bp, payout, won, difficulty, created_at
     FROM game_history
     ORDER BY created_at DESC
     LIMIT 10000`
  );
  if (result) {
    for (const row of result.rows) {
      const rec: HistoryRecord = {
        sessionId: row.session_id,
        player: row.player,
        chain: row.chain as "celo",
        unit: row.unit,
        stake: Number(row.stake),
        multiplierBp: row.multiplier_bp,
        payout: Number(row.payout),
        won: row.won,
        difficulty: row.difficulty != null ? Number(row.difficulty) : undefined,
        approxTs: row.created_at.getTime(),
      };
      bySession.set(rec.sessionId, rec);
      const k = playerKey(rec.player);
      const arr = byPlayer.get(k) ?? [];
      arr.push(rec.sessionId);
      byPlayer.set(k, arr);
    }
    console.log(`[gameHistory] loaded ${result.rowCount} records from DB`);
  }
  hydrated = true;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export function recordCompletedGame(rec: HistoryRecord): void {
  if (bySession.has(rec.sessionId)) return; // idempotent
  bySession.set(rec.sessionId, rec);
  const k = playerKey(rec.player);
  const arr = byPlayer.get(k) ?? [];
  arr.push(rec.sessionId);
  byPlayer.set(k, arr);

  // Fire-and-forget DB write
  void query(
    `INSERT INTO game_history
       (session_id, player, chain, unit, stake, multiplier_bp, payout, won, difficulty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (session_id) DO NOTHING`,
    [
      rec.sessionId,
      playerKey(rec.player),
      rec.chain,
      rec.unit,
      rec.stake,
      rec.multiplierBp,
      rec.payout,
      rec.won,
      rec.difficulty ?? null,
    ]
  );
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getPlayerHistory(address: string): HistoryRecord[] {
  const k = playerKey(address);
  const ids = byPlayer.get(k) ?? [];
  return ids.map((id) => bySession.get(id)!).filter(Boolean);
}

export function hasSession(sessionId: string): boolean {
  return bySession.has(sessionId);
}
