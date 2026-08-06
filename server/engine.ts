// Copyright (c) 2024–2025 greyw0rks. All rights reserved.
// Proprietary and confidential. Unauthorised copying or redistribution is prohibited.
// See LICENSE in the repository root for full terms.

// Pure multiplier math, mirroring QuizArcade.sol. Multiplier is in basis points: 10_000 = 1.0x.
// The per-round ±0.1x walk below is V2/demo only — Casual settles on the graduated pass mark
// (scoreCasualSession) instead, and never walks during the round.

export const BPS = 10_000;
export const STEP_BPS = 1_000;

// ── Casual graduated pass-mark scoring (2026-08-04) ─────────────────────────────────────────────
// Casual play no longer walks the multiplier per question during the round. A session is one round
// of CASUAL_QUESTIONS questions and the final correct-count sets the multiplier ONCE, graduated by
// how far past a mark it lands:
//
//   correct ≥ CASUAL_PASS_MARK (9)  → +0.1x for each correct FROM the mark up:
//                                     9→1.1x, 10→1.2x, 11→1.3x, 12→1.4x
//   correct ≤ CASUAL_FAIL_MARK (4)  → −0.1x for each miss FROM the mark down:
//                                     4→0.9x, 3→0.8x, 2→0.7x, 1→0.6x, 0→0.5x
//   between the marks (5..8)        →  hold at 1.0x (neutral)
//
// The most the multiplier can reach is casualMaxSteps() steps above 1.0x — 4 steps → 1.4x at the
// default pass mark. The session commits that as its on-chain maxRounds, so QuizArcadeV2 caps and
// reserves at exactly 1.0 + 0.1·casualMaxSteps() and no contract change is needed. Marks are tunable
// per deploy via CASUAL_PASS_MARK / CASUAL_FAIL_MARK; a very low pass mark raises the cap and could
// exceed the contract's maxRoundsCap at startSession, so keep pass ≥ 7 (cap ≤ 1.6x) in practice.

export const CASUAL_QUESTIONS = 12;
export const CASUAL_DEFAULT_PASS_MARK = 9;
export const CASUAL_DEFAULT_FAIL_MARK = 4;

export type CasualZone = "pass" | "neutral" | "fail";

/** Correct answers needed to GAIN. Clamped to 1..CASUAL_QUESTIONS. */
export function casualPassMark(): number {
  const n = Number(process.env.CASUAL_PASS_MARK);
  if (!Number.isFinite(n)) return CASUAL_DEFAULT_PASS_MARK;
  return Math.min(CASUAL_QUESTIONS, Math.max(1, Math.floor(n)));
}

/**
 * Correct answers at or below which the round LOSES. Must stay strictly below the pass mark, or the
 * neutral zone vanishes; clamped to [0, pass-1].
 */
export function casualFailMark(): number {
  const pass = casualPassMark();
  const n = Number(process.env.CASUAL_FAIL_MARK);
  const raw = Number.isFinite(n) ? Math.floor(n) : CASUAL_DEFAULT_FAIL_MARK;
  return Math.min(pass - 1, Math.max(0, raw));
}

/**
 * Number of +0.1x steps a perfect round earns = the on-chain scoring-event count committed at
 * startSession and the basis for the contract's payout cap (maxMult = 1.0 + 0.1·casualMaxSteps()).
 * At the default pass mark this is 12 − 9 + 1 = 4 → a 1.4x ceiling.
 */
export function casualMaxSteps(): number {
  return CASUAL_QUESTIONS - casualPassMark() + 1;
}

/**
 * Score one completed casual session (12 questions) into a single graduated multiplier outcome.
 * Pure: the caller clamps to the on-chain session max (clampFinalBp) before signing.
 */
export function scoreCasualSession(correct: number): { multiplierBp: number; zone: CasualZone } {
  const pass = casualPassMark();
  const fail = casualFailMark();
  if (correct >= pass) {
    const steps = correct - pass + 1; // 1 step at the mark, up to casualMaxSteps() at a perfect round
    return { multiplierBp: BPS + STEP_BPS * steps, zone: "pass" };
  }
  if (correct <= fail) {
    const steps = fail + 1 - correct; // 1 step at the mark, deeper as more are missed
    return { multiplierBp: Math.max(0, BPS - STEP_BPS * steps), zone: "fail" };
  }
  return { multiplierBp: BPS, zone: "neutral" }; // 1.0x — holds
}

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
