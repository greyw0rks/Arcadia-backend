// Copyright (c) 2024–2025 greyw0rks. All rights reserved.
// Proprietary and confidential. Unauthorised copying or redistribution is prohibited.
// See LICENSE in the repository root for full terms.

// Pure multiplier math, mirroring QuizArcade.sol. Multiplier is in basis points: 10_000 = 1.0x.
// Starts at 1.0x; +0.1x per correct round, -0.1x per wrong round; floored at 0; capped by maxRounds.

export const BPS = 10_000;
export const STEP_BPS = 1_000;

/** Starting multiplier for a fresh session (1.0x). */
export function initialMultiplierBp(): number {
  return BPS;
}

/** Apply one round result to the running multiplier (bps), flooring at 0. */
export function applyResult(currentBp: number, result: "correct" | "wrong"): number {
  const next = result === "correct" ? currentBp + STEP_BPS : currentBp - STEP_BPS;
  return Math.max(0, next);
}

/** Max multiplier (bps) achievable for a session, matching the contract clamp. */
export function maxMultiplierBp(maxRounds: number): number {
  return BPS + STEP_BPS * maxRounds;
}

/** Clamp a final multiplier to [0, max] before signing, matching the contract. */
export function clampFinalBp(bp: number, maxRounds: number): number {
  return Math.min(Math.max(0, bp), maxMultiplierBp(maxRounds));
}
