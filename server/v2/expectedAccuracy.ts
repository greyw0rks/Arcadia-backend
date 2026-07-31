// server/v2/expectedAccuracy.ts — what an honest player should score, given what they were served.
//
// The V1 classifier uses one global threshold: 90% accuracy plus fast answers means flagged. That
// works when the difficulty floor guarantees honest accuracy is 30–41% (V1 serves only hard and
// extreme), leaving huge headroom.
//
// §4.1 removes that floor. Honest accuracy now ranges 51–65% by band at average skill, and a strong
// player in the recovery band expects ~87% — three points under the flag. Roughly half such
// sessions would clear it on expectation alone, and the cohort at risk is the worst possible one:
// a player who already busted and paid another $1.
//
// So the comparison has to be relative. Not "did they score above 90%" but "did they score far
// above what THIS mix of questions makes plausible". A session of easy questions answered at 85% is
// unremarkable; a session of extreme questions answered at 85% is not.

/**
 * Per-tier accuracy for a player of average skill. THESE ARE ASSUMPTIONS pending measurement — the
 * calibration sampler exists to replace them (GET /api/admin/v2/calibration). Until then this
 * module is directionally right and numerically provisional, which is why the multiplier below is
 * deliberately generous.
 */
export const P_TIER = [0.85, 0.65, 0.45, 0.3] as const;

/** Blind guess on a 4-option question. Nothing honest sits below this for long. */
export const GUESS_RATE = 0.25;

/**
 * How much better than expectation is still plausible for a very strong human.
 *
 * 1.45 is the skill ceiling used by scripts/v2-bust-sim.py's population model, so a player at the
 * top of the modelled distribution is not flagged for playing well. Erring high is deliberate:
 * a false positive costs a real player a real payout, a false negative costs one session's rake.
 */
export const SKILL_CEILING = 1.45;

/**
 * Expected accuracy for a specific set of served tiers.
 *
 * `tiers` is the per-question tier list actually served — RoundState.tier already carries it, and
 * calibration_samples records it, so no new plumbing is needed.
 */
export function expectedAccuracy(tiers: number[]): number {
  if (tiers.length === 0) return 0;
  const total = tiers.reduce((sum, t) => sum + (P_TIER[t] ?? P_TIER[1]), 0);
  return total / tiers.length;
}

/**
 * The accuracy above which a session is implausible for the difficulty it faced.
 *
 * Capped just under 1: on a round of easy questions a strong player can legitimately score 100%,
 * and accuracy alone must never be sufficient to flag. The speed signal is what distinguishes
 * "good player" from "not reading the screen".
 */
export function implausibleAbove(tiers: number[]): number {
  const expected = expectedAccuracy(tiers);
  const ceiling = Math.min(0.98, expected * SKILL_CEILING);
  // Never below the old global threshold — this is meant to catch what a fixed 90% misses on hard
  // sessions, not to become more lenient than it was on easy ones.
  return Math.max(ceiling, GUESS_RATE * 2);
}

export interface DifficultyContext {
  /** Tiers served across the session, one entry per question. */
  tiers: number[];
}

/**
 * True when this accuracy is beyond what the served difficulty makes plausible.
 *
 * Returns false when no tier data is available — a procedural game like `math` carries no tiers,
 * and absence of evidence must not become evidence of cheating.
 */
export function isImplausiblyAccurate(accuracy: number, ctx: DifficultyContext): boolean {
  if (!ctx.tiers || ctx.tiers.length === 0) return false;
  return accuracy > implausibleAbove(ctx.tiers);
}
