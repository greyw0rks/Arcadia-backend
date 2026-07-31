// server/v2/runs.ts — weekly run state: entries, rounds, bust.
//
// A "run" is a life. It opens at 1.0x on entry or rebuy and ends at bust. A player may hold several
// runs in a week: the busted ones plus at most one live.
//
// Everything here touches money, so it goes through server/v2/db.ts (throws on failure) rather than
// server/db.ts query() (returns null, which callers read as "no rows"). A dropped connection must
// abort the operation, not look like an empty result.

import { mustQuery, mustQueryOne, mustQueryMaybe } from "./db";
import { scoreRound, applyRound, isBust, ROUND_STEP, FREE_ROUNDS_PER_DAY } from "./scoring";
import { bandFor } from "./bands";

const BP = 10_000;
const STEP_BP = Math.round(ROUND_STEP * BP); // 0.10x -> 1000bp

export interface WeeklyRun {
  id: string;
  weekId: number;
  player: string;
  chain: string;
  multiplierBp: number;
  busted: boolean;
  openedBy: "entry" | "rebuy";
}

function toRun(r: Record<string, unknown>): WeeklyRun {
  return {
    id: String(r.id),
    weekId: Number(r.week_id),
    player: String(r.player),
    chain: String(r.chain),
    multiplierBp: Number(r.multiplier_bp),
    busted: Boolean(r.busted),
    openedBy: r.opened_by as "entry" | "rebuy",
  };
}

/** The player's live (non-busted) run for a week, or null. */
export async function liveRun(weekId: number, player: string, chain: string): Promise<WeeklyRun | null> {
  const row = await mustQueryMaybe<Record<string, unknown>>(
    `SELECT id, week_id, player, chain, multiplier_bp, busted, opened_by
       FROM weekly_runs
      WHERE week_id = $1 AND player = $2 AND chain = $3 AND NOT busted`,
    [weekId, player.toLowerCase(), chain]
  );
  return row ? toRun(row) : null;
}

/**
 * Open a run. `entry` for the week's first, `rebuy` after a bust — both start at 1.0x, since a
 * rebuy is a full reset (spec §6).
 *
 * The "one live run per week" rule is enforced by a partial unique index in the database, not here.
 * Two concurrent requests would both pass an application-level check; only the index actually
 * holds. A violation surfaces as a thrown constraint error, which is the correct outcome — it means
 * the player already has a run and this entry should not have been accepted.
 */
export async function openRun(
  weekId: number,
  player: string,
  chain: string,
  openedBy: "entry" | "rebuy",
  entryTx?: string
): Promise<WeeklyRun> {
  const row = await mustQueryOne<Record<string, unknown>>(
    `INSERT INTO weekly_runs (week_id, player, chain, multiplier_bp, opened_by, entry_tx)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, week_id, player, chain, multiplier_bp, busted, opened_by`,
    [weekId, player.toLowerCase(), chain, BP, openedBy, entryTx ?? null]
  );
  return toRun(row);
}

/** Every run a player holds in a week, live and busted. Basis for the weekend tally. */
export async function runsForWeek(weekId: number, chain: string) {
  const res = await mustQuery<Record<string, unknown>>(
    `SELECT player, multiplier_bp, busted FROM weekly_runs WHERE week_id = $1 AND chain = $2`,
    [weekId, chain]
  );
  return res.rows.map((r) => ({
    player: String(r.player),
    multiplierBp: Number(r.multiplier_bp),
    busted: Boolean(r.busted),
  }));
}

/** How many rounds this run has played today — decides whether the next one is purchased. */
export async function roundsToday(runId: string, day: string): Promise<number> {
  const row = await mustQueryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM weekly_rounds WHERE run_id = $1 AND day = $2`,
    [runId, day]
  );
  return Number(row.n);
}

export interface RoundResult {
  passed: boolean;
  deltaBp: number;
  multiplierBp: number;
  busted: boolean;
  purchased: boolean;
  /** Rounds left in today's free allowance after this one. */
  freeRoundsLeft: number;
  band: string;
}

/**
 * Score a completed round and bank the result.
 *
 * Idempotent per (run, day, dayIndex): the UNIQUE constraint means a retried request — a flaky
 * mobile connection resending the same round — cannot move the multiplier twice. On conflict the
 * already-recorded outcome is returned instead of applying a second delta.
 *
 * Purchased rounds are upside-only (spec §4.2): they can gain but never subtract. Under symmetric
 * scoring, buying rounds raises the buyer's own bust probability while the platform rakes every
 * ticket — paying money to make your own ruin likelier. That is enforced in scoreRound().
 */
export async function recordRound(
  run: WeeklyRun,
  opts: { day: string; dayIndex: number; correct: number; sessionId?: string }
): Promise<RoundResult> {
  const purchased = opts.dayIndex >= FREE_ROUNDS_PER_DAY;
  const outcome = scoreRound(opts.correct, { purchased });

  const currentMultiplier = run.multiplierBp / BP;
  const nextMultiplier = applyRound(currentMultiplier, outcome);
  const nextBp = Math.round(nextMultiplier * BP);
  const busted = isBust(nextMultiplier);
  const deltaBp = Math.round(outcome.delta * BP);

  // The round row is the idempotency key. If it already exists this request is a retry.
  const inserted = await mustQuery<Record<string, unknown>>(
    `INSERT INTO weekly_rounds
       (run_id, day, day_index, purchased, correct, passed, delta_bp, multiplier_bp, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (run_id, day, day_index) DO NOTHING
     RETURNING id`,
    [run.id, opts.day, opts.dayIndex, purchased, opts.correct, outcome.passed, deltaBp, nextBp, opts.sessionId ?? null]
  );

  if (inserted.rowCount === 0) {
    // Retry of a round already scored. Return what was banked, without touching the multiplier.
    const prior = await mustQueryOne<Record<string, unknown>>(
      `SELECT passed, delta_bp, multiplier_bp, purchased
         FROM weekly_rounds WHERE run_id = $1 AND day = $2 AND day_index = $3`,
      [run.id, opts.day, opts.dayIndex]
    );
    const bankedBp = Number(prior.multiplier_bp);
    return {
      passed: Boolean(prior.passed),
      deltaBp: Number(prior.delta_bp),
      multiplierBp: bankedBp,
      busted: bankedBp <= 0,
      purchased: Boolean(prior.purchased),
      freeRoundsLeft: Math.max(0, FREE_ROUNDS_PER_DAY - (opts.dayIndex + 1)),
      band: bandFor(bankedBp).label,
    };
  }

  // Only advance the run after the round row is committed, so a crash between the two leaves the
  // round recorded and the multiplier unchanged — recoverable — rather than the reverse.
  await mustQuery(
    `UPDATE weekly_runs
        SET multiplier_bp = $1,
            busted = $2,
            busted_at = CASE WHEN $2 THEN NOW() ELSE busted_at END
      WHERE id = $3`,
    [nextBp, busted, run.id]
  );

  return {
    passed: outcome.passed,
    deltaBp,
    multiplierBp: nextBp,
    busted,
    purchased,
    freeRoundsLeft: Math.max(0, FREE_ROUNDS_PER_DAY - (opts.dayIndex + 1)),
    band: bandFor(nextBp).label,
  };
}

export { BP, STEP_BP };
