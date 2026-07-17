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

export interface FlagRow {
  sessionId: string;
  player: string;
  chain: string;
  gameId: string;
  verdict: string;
  reasons: string[];
  stats: SessionTimingStats;
  stake: number | null;
  unit: string | null;
  multiplierBp: number;
  enforced: boolean;
  createdAt: number;
}

function toFlagRow(r: {
  session_id: string; player: string; chain: string; game_id: string; verdict: string;
  reasons: unknown; stats: unknown; stake: string | null; unit: string | null;
  multiplier_bp: number; enforced: boolean; created_at: Date;
}): FlagRow {
  // reasons/stats are JSONB — pg returns them already parsed, but guard for string form too.
  const parse = <T,>(v: unknown, fallback: T): T =>
    v == null ? fallback : typeof v === "string" ? (JSON.parse(v) as T) : (v as T);
  return {
    sessionId: r.session_id,
    player: r.player,
    chain: r.chain,
    gameId: r.game_id,
    verdict: r.verdict,
    reasons: parse<string[]>(r.reasons, []),
    stats: parse<SessionTimingStats>(r.stats, {} as SessionTimingStats),
    stake: r.stake !== null ? Number(r.stake) : null,
    unit: r.unit,
    multiplierBp: r.multiplier_bp,
    enforced: r.enforced,
    createdAt: new Date(r.created_at).getTime(),
  };
}

/** List recent flags, optionally filtered by verdict and/or player. Most recent first. */
export async function listFlags(opts?: {
  verdict?: "suspect" | "flagged";
  player?: string;
  chain?: ChainId;
  limit?: number;
}): Promise<FlagRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (opts?.verdict) { args.push(opts.verdict); where.push(`verdict = $${args.length}`); }
  if (opts?.player) { args.push(addr(opts.player)); where.push(`player = $${args.length}`); }
  if (opts?.chain) { args.push(opts.chain); where.push(`chain = $${args.length}`); }
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  args.push(limit);
  const res = await query<Parameters<typeof toFlagRow>[0]>(
    `SELECT session_id, player, chain, game_id, verdict, reasons, stats, stake, unit, multiplier_bp, enforced, created_at
     FROM cheat_flags
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY created_at DESC
     LIMIT $${args.length}`,
    args
  );
  return res ? res.rows.map(toFlagRow) : [];
}

export interface RepeatOffender {
  player: string;
  chain: string;
  totalFlags: number;
  flaggedVerdicts: number; // hard "flagged" count
  suspectVerdicts: number;
  lastFlaggedAt: number;
  games: string[]; // distinct games they were flagged in
}

/**
 * Wallets with at least `minFlagged` hard "flagged" verdicts — the clawback sweep's candidates.
 * Aggregated over cheat_flags. Ordered by hard-flag count desc.
 */
export async function getRepeatOffenders(minFlagged: number, chain?: ChainId): Promise<RepeatOffender[]> {
  const args: unknown[] = [minFlagged];
  let chainClause = "";
  if (chain) { args.push(chain); chainClause = `AND chain = $${args.length}`; }
  const res = await query<{
    player: string; chain: string; total: string; flagged: string; suspect: string;
    last: Date; games: string[];
  }>(
    `SELECT player, chain,
            count(*) AS total,
            count(*) FILTER (WHERE verdict = 'flagged') AS flagged,
            count(*) FILTER (WHERE verdict = 'suspect') AS suspect,
            max(created_at) AS last,
            array_agg(DISTINCT game_id) AS games
     FROM cheat_flags
     WHERE TRUE ${chainClause}
     GROUP BY player, chain
     HAVING count(*) FILTER (WHERE verdict = 'flagged') >= $1
     ORDER BY flagged DESC, total DESC`,
    args
  );
  return res
    ? res.rows.map((r) => ({
        player: r.player,
        chain: r.chain,
        totalFlags: Number(r.total),
        flaggedVerdicts: Number(r.flagged),
        suspectVerdicts: Number(r.suspect),
        lastFlaggedAt: new Date(r.last).getTime(),
        games: r.games ?? [],
      }))
    : [];
}

