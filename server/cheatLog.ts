// server/cheatLog.ts — persistent record of anti-cheat flags, for review and statistical clawback.
//
// Every non-clean session verdict is written to the cheat_flags table (fire-and-forget). This is the
// data source for: (a) manual review, (b) a batch job that denylists wallets with a pattern of
// flags, and (c) the signer's future clawback decisions. No-op when DATABASE_URL is absent.

import { query } from "./db";
import type { ChainId } from "../lib/contract";
import type { SessionTimingStats, Verdict } from "./anticheat";

export interface FlagRecord {
  sessionId: string;
  player: string;
  chain: ChainId;
  gameId: string;
  verdict: Verdict;
  reasons: string[];
  stats: SessionTimingStats;
  stake?: number;
  unit?: string;
  multiplierBp: number;
  enforced: boolean;
}

function addr(a: string): string {
  return a.startsWith("0x") ? a.toLowerCase() : a;
}

/** Persist a flag. Fire-and-forget; failures are swallowed so finalize is never blocked. */
export function recordFlag(rec: FlagRecord): void {
  void query(
    `INSERT INTO cheat_flags
       (session_id, player, chain, game_id, verdict, reasons, stats, stake, unit, multiplier_bp, enforced)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (session_id) DO NOTHING`,
    [
      rec.sessionId,
      addr(rec.player),
      rec.chain,
      rec.gameId,
      rec.verdict,
      JSON.stringify(rec.reasons),
      JSON.stringify(rec.stats),
      rec.stake ?? null,
      rec.unit ?? null,
      rec.multiplierBp,
      rec.enforced,
    ]
  );
}

export interface PlayerFlagSummary {
  flags: number;
  flaggedVerdicts: number; // count of hard "flagged" verdicts (vs "suspect")
  lastFlaggedAt: number | null;
}

/** How many times a wallet has been flagged — input to denylist / clawback decisions. */
export async function getPlayerFlagSummary(player: string, chain: ChainId): Promise<PlayerFlagSummary> {
  const res = await query<{ flags: string; flagged: string; last: Date | null }>(
    `SELECT count(*) AS flags,
            count(*) FILTER (WHERE verdict = 'flagged') AS flagged,
            max(created_at) AS last
     FROM cheat_flags WHERE player = $1 AND chain = $2`,
    [addr(player), chain]
  );
  const row = res?.rows[0];
  return {
    flags: row ? Number(row.flags) : 0,
    flaggedVerdicts: row ? Number(row.flagged) : 0,
    lastFlaggedAt: row?.last ? new Date(row.last).getTime() : null,
  };
}
