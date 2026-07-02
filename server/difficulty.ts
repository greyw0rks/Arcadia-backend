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

// Per-session stake cap, in DISPLAY units (USDM/USDC / STX). Stablecoin chains cap at 1 USD. STX is
// not USD-pegged; fixed 1-STX cap (matches the on-chain `max-stake` of 1_000_000 micro-STX).
export const MAX_STAKE: Record<ChainId, number> = {
  celo: 1,
  base: 1,
  stacks: 1,
};

// Difficulty knobs.
export const MIN_ROUNDS = 7; // lowest-stake session: 7 rounds minimum
export const MAX_ROUNDS = 15; // highest-stake session: 15 rounds
export const MAX_ROUNDS_CAP = 20; // mirror the contracts' maxRoundsCap; defensive clamp
export const TIMER_SHRINK = 0.75; // at max difficulty the timer is 25% of its base — brutal
export const MIN_TIMER_SEC = 3; // hard floor

/** Clamp `n` into [lo, hi]. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Difficulty fraction d ∈ [0, 1] from the on-chain effective stake.
 * `effectiveMaxStake = maxStake * (BPS - rakeBps) / BPS`. Because the flat rake scales numerator and
 * denominator alike, d == stake / maxStake exactly, so this is rake-independent.
 */
export function difficultyFraction(effectiveStake: number, effectiveMaxStake: number): number {
  if (!(effectiveMaxStake > 0)) return 0;
  return clamp(effectiveStake / effectiveMaxStake, 0, 1);
}

/** Difficulty fraction from a DISPLAY-unit stake (used by the client preview + /api/session). */
export function difficultyFromStake(stake: number, chain: ChainId): number {
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
  return clamp(Number(scaled) / BPS, 0, 1);
}

// Default rake (bps) mirroring the contracts' constructor default. Difficulty is rake-independent
// (the rake cancels in the ratio), so an on-chain rake change does not skew the fraction.
export const DEFAULT_RAKE_BPS = 300;

/**
 * Number of rounds for a difficulty fraction, capped by the game's unique-question bank so a session
 * never repeats an entry (the bank pickers are no-repeat only while roundIndex < bankSize).
 */
export function roundsFor(d: number, bankSize: number): number {
  const scaled = Math.round(MIN_ROUNDS + clamp(d, 0, 1) * (MAX_ROUNDS - MIN_ROUNDS));
  const ceiling = Math.min(MAX_ROUNDS, MAX_ROUNDS_CAP, Math.max(MIN_ROUNDS, bankSize));
  return clamp(scaled, MIN_ROUNDS, ceiling);
}

/** Per-round time limit (seconds) after shrinking the game's base limit by difficulty. */
export function scaleTimer(baseSec: number, d: number): number {
  return Math.max(MIN_TIMER_SEC, Math.round(baseSec * (1 - TIMER_SHRINK * clamp(d, 0, 1))));
}
