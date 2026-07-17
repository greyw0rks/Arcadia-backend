// Copyright (c) 2024–2025 greyw0rks. All rights reserved.
// Proprietary and confidential. Unauthorised copying or redistribution is prohibited.
// See LICENSE in the repository root for full terms.

// Bet-scaled difficulty. The higher the player's stake (relative to the $5 cap), the harder the
// session: fewer seconds per round, more rounds, and harder generated questions. Pure + shared so
// the client and the server compute IDENTICAL round counts.
//
// SECURITY: the difficulty fraction MUST be derived from the REAL on-chain stake (read in
// /api/round), never a client-claimed value — otherwise a player could request an easy session but
// stake the max for a large, easy payout. The client copy below is for UI preview only; the server
// reconciles against the chain.

import type { ChainId } from "../lib/contract";

// Multiplier-math constants (mirror the contracts).
export const BPS = 10_000;
export const STEP_BPS = 1_000;

// Per-session stake cap in DISPLAY units (USDM/USDC). Caps at $1 USD.
export const MAX_STAKE: Record<ChainId, number> = {
  celo: 1,
};

// Per-session MINIMUM stake in DISPLAY units. Blocks zero/negative bets. Low entry ($0.10) is fine
// because the difficulty FLOOR (below) keeps every session hard regardless of stake.
export const MIN_STAKE: Record<ChainId, number> = {
  celo: 0.1,
};

// Difficulty knobs.
// Difficulty FLOOR applied to every real session. The bet-scaled fraction is remapped from
// [0,1] onto [MIN_DIFFICULTY, 1] so even a minimum-stake game is hard. Closes a pool-drain
// vector: at d=0 the questions were trivial and the timer full, letting a competent player grind
// low stakes to a reliable +EV multiplier and slowly drain the treasury.
export const MIN_DIFFICULTY = 0.5;

// Round count scales UP with the raw stake (bucketed to hit product anchors):
//   $0.10 → 3 rounds, $0.30 → 4, $0.50 → 5, $1.00 → 6.
export const MIN_ROUNDS = 3; // fewest rounds — served at the LOWEST stake
export const MAX_ROUNDS = 6; // most rounds — served at the HIGHEST stake ($1)
export const MAX_ROUNDS_CAP = 20; // mirror the contracts' maxRoundsCap; defensive clamp
export const TIMER_SHRINK = 0.75; // at max difficulty the timer is 25% of its base — brutal
export const MIN_TIMER_SEC = 3; // hard floor

/** Clamp `n` into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Remap a raw bet fraction in [0,1] onto [MIN_DIFFICULTY, 1] so the least-stake session already
 * starts at the difficulty floor. MUST be applied identically on both the client-preview path
 * (difficultyFromStake) and the authoritative on-chain path (difficultyFractionBaseUnits) or the
 * two round counts diverge.
 */
function applyFloor(fraction: number): number {
  return MIN_DIFFICULTY + (1 - MIN_DIFFICULTY) * clamp(fraction, 0, 1);
}

/** Difficulty fraction from a DISPLAY-unit stake (used by the client preview + /api/session). */
export function difficultyFromStake(stake: number, chain: ChainId): number {
  return applyFloor((stake || 0) / MAX_STAKE[chain]);
}

/**
 * RAW (un-floored) stake fraction in [0,1] = stake / MAX_STAKE. Round count scales with this, NOT
 * with the floored difficulty — the floor keeps questions hard, while rounds still track the bet.
 */
export function rawStakeFraction(stake: number, chain: ChainId): number {
  return clamp((stake || 0) / MAX_STAKE[chain], 0, 1);
}

/** Effective (post-rake) max stake in token base units, for the on-chain comparison. */
export function effectiveMaxStakeBaseUnits(
  maxStakeBaseUnits: bigint,
  rakeBps: number
): bigint {
  return (maxStakeBaseUnits * BigInt(BPS - rakeBps)) / BigInt(BPS);
}

/**
 * Difficulty fraction from on-chain base-unit values, computed in bigint to avoid Number precision
 * loss on 18-decimal stakes (5e18 > Number.MAX_SAFE_INTEGER).
 */
export function difficultyFractionBaseUnits(
  effectiveStake: bigint,
  maxStakeBaseUnits: bigint,
  rakeBps: number
): number {
  const effMax = effectiveMaxStakeBaseUnits(maxStakeBaseUnits, rakeBps);
  if (effMax <= 0n) return 0;
  const scaled = (effectiveStake * BigInt(BPS)) / effMax; // 0..BPS (may exceed if over-staked)
  return applyFloor(Number(scaled) / BPS);
}

// Default rake (bps) mirroring the contracts' constructor default. Difficulty is rake-independent
// (the rake cancels in the ratio), so an on-chain rake change does not skew the fraction.
export const DEFAULT_RAKE_BPS = 300;

/**
 * Number of rounds for a RAW stake fraction (0..1 = stake/MAX_STAKE), capped by the game's
 * unique-question bank so a session never repeats an entry.
 *
 * Rounds scale UP with the bet, bucketed to hit the product anchors:
 *   frac ≤ 0.20 ($0.10–$0.20) → 3 rounds
 *   frac ≤ 0.40 ($0.30–$0.40) → 4 rounds
 *   frac ≤ 0.70 ($0.50–$0.70) → 5 rounds
 *   frac >  0.70 ($0.80–$1.00) → 6 rounds
 * NOTE: pass the RAW fraction (rawStakeFraction), not the floored difficulty — difficulty is floored
 * to keep questions hard, but the round count must still track the actual stake.
 */
export function roundsFor(frac: number, bankSize: number): number {
  const f = clamp(frac, 0, 1);
  let rounds: number;
  if (f <= 0.20) rounds = 3;
  else if (f <= 0.40) rounds = 4;
  else if (f <= 0.70) rounds = 5;
  else rounds = 6;
  // Cap at bankSize directly so tiny banks (e.g. 5 movie stills) never repeat questions.
  const ceiling = Math.min(MAX_ROUNDS, MAX_ROUNDS_CAP, bankSize);
  const floor   = Math.min(MIN_ROUNDS, ceiling);
  return clamp(rounds, floor, ceiling);
}

/** Per-round time limit (seconds) after shrinking the game's base limit by difficulty. */
export function scaleTimer(baseSec: number, d: number): number {
  return Math.max(MIN_TIMER_SEC, Math.round(baseSec * (1 - TIMER_SHRINK * clamp(d, 0, 1))));
}
