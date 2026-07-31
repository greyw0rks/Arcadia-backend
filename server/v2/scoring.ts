// server/v2/scoring.ts — the V2 round-scoring mechanic.
//
// Signed off 2026-07-31 (docs/V2_SCORING_DECISION.md). Replaces V1's per-question ±0.01x walk,
// which simulation showed cannot produce a workable economy: across 1,050 events per week the noise
// term (0.01·√1050 ≈ ±0.32x) is smaller than the drift a 2-point accuracy edge produces (0.42x), so
// outcomes become a deterministic readout of accuracy. Bust rate cliffs 85%→0.2% across one step of
// skill, and payout spread collapses to 1.56x.
//
// The fix is FEWER, BIGGER events: one ±0.10x move per round instead of 1,050 of ±0.01x. Cutting
// the daily allowance was the intuitive alternative and barely helps, because noise falls as √K
// while drift falls as K — only event granularity moves the ratio.
//
// Three decisions are encoded here. Keep them together: they were simulated together, and the
// upside-only rule in particular is a safety property, not a tuning knob.

/** Multiplier move per round. Ten times V1's step, one seventieth the frequency. */
export const ROUND_STEP = 0.1;

export const QUESTIONS_PER_ROUND = 15;

/** Free rounds per day. Rounds beyond this are purchased and score upside-only. */
export const FREE_ROUNDS_PER_DAY = 10;

/**
 * Correct answers needed for a round to gain instead of lose.
 *
 * THIS IS A LIVE ECONOMIC PARAMETER, NOT A CONSTANT. Bust rate is a smooth, monotonic function of
 * this single integer — 1.8% / 8.4% / 23.8% / 48.2% / 73.0% at pass marks 7/8/9/10/11 — which is
 * the whole point of the rework: a target bust rate is now reachable by choosing it.
 *
 * 9 gives ~24%, deliberately below the 30–35% the revenue model assumes. Launching lenient and
 * tightening with real data is far better than busting testers out of the beta and losing the
 * accuracy measurements that calibrate everything else.
 *
 * Tunable per week without a redeploy via V2_PASS_MARK. Re-run scripts/v2-bust-sim.py against
 * MEASURED per-tier accuracy (GET /api/admin/v2/calibration) before changing it — the 9 rests on
 * four invented accuracies (easy 85% / medium 65% / hard 45% / extreme 30%).
 */
export const DEFAULT_PASS_MARK = 9;

export function passMark(): number {
  const n = Number(process.env.V2_PASS_MARK);
  if (!Number.isFinite(n)) return DEFAULT_PASS_MARK;
  // Outside 1..15 the mechanic degenerates (never gains / always gains), so clamp rather than trust
  // a typo in an env var that moves real money.
  return Math.min(QUESTIONS_PER_ROUND, Math.max(1, Math.floor(n)));
}

export interface RoundOutcome {
  /** Signed multiplier change for this round: +ROUND_STEP, -ROUND_STEP, or 0. */
  delta: number;
  passed: boolean;
  /** True when the round would have lost but was a purchased round, so the loss was waived. */
  lossWaived: boolean;
}

/**
 * Score one completed round.
 *
 * `purchased` marks a round bought beyond the free daily allowance. Those are UPSIDE-ONLY: they can
 * gain but never subtract. This is a safety property, not a balance tweak — under symmetric scoring
 * a player spending $14/week on extra rounds raises their own bust probability by ~8 points while
 * the platform rakes every ticket, which is a predatory pattern. Upside-only caps the buyer's
 * downside at the ticket price. Free rounds stay symmetric so the core game keeps its tension.
 */
export function scoreRound(correct: number, opts?: { purchased?: boolean }): RoundOutcome {
  const passed = correct >= passMark();
  if (passed) return { delta: ROUND_STEP, passed: true, lossWaived: false };
  if (opts?.purchased) return { delta: 0, passed: false, lossWaived: true };
  return { delta: -ROUND_STEP, passed: false, lossWaived: false };
}

/**
 * Apply a round outcome to a running multiplier. Never returns a negative value — reaching zero is
 * bust, and bust is a floor rather than something to accumulate past.
 *
 * Rounded to 2dp because repeated float addition of 0.1 drifts (0.1+0.2 !== 0.3), and this number
 * decides a payout.
 */
export function applyRound(multiplier: number, outcome: RoundOutcome): number {
  return Math.max(0, Math.round((multiplier + outcome.delta) * 100) / 100);
}

/** Bust is the multiplier reaching zero. The run ends; a $1 rebuy restarts at 1.0x. */
export function isBust(multiplier: number): boolean {
  return multiplier <= 0;
}
