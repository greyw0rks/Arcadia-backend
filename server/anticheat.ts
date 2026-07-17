// server/anticheat.ts — timing-based cheat/automation detection.
//
// The threat we defend against is NOT tampering (answer keys never leave the server, deadlines are
// server-stamped, and nothing settles without our EIP-712 signature). The threat is a player using
// an AI/bot to answer these multiple-choice questions with superhuman accuracy AND speed.
//
// Signal: response time. A human reads four options and decides with variance (typically 2–6s,
// jittery). An AI-assisted/automated player answers fast and uniformly. We record per-answer latency
// and classify a finished session as clean / suspect / flagged.
//
// POSTURE: enforcement is gated behind ANTICHEAT_ENFORCE. When false (default) we LOG and FLAG but
// still allow settlement — so real timing data can be gathered and thresholds tuned before any payout
// is denied. When true, the signer refuses to sign a flagged session (funds are refundable instead).

// ── Tunables (ms) ──────────────────────────────────────────────────────────
// Minimum plausible human response: reading a 4-option question and clicking. Below this is not a
// human reading the screen — it's a script or a pre-known answer.
export const FAST_ANSWER_FLOOR_MS = 400;

// An answer this fast that is ALSO correct is "suspiciously fast" — counted toward the flag.
export const SUSPICIOUS_FAST_MS = 900;

// A session is FLAGGED when a player is both very accurate and consistently very fast — the AI
// signature. Tuned conservatively (detect-first); make stricter once real data is in.
export const FLAG_MIN_ANSWERS = 3;            // don't judge ultra-short sessions
export const FLAG_ACCURACY = 0.9;             // >=90% correct
export const FLAG_FAST_FRACTION = 0.6;        // AND >=60% of answers were suspiciously fast
export const FLAG_MEAN_MS = 1200;             // OR mean response under 1.2s at high accuracy

/** True when settlement should be BLOCKED for flagged sessions. Default false (detect-only). */
export function enforcementOn(): boolean {
  return String(process.env.ANTICHEAT_ENFORCE).toLowerCase() === "true";
}

export interface AnswerTiming {
  responseMs: number;   // deadline-relative time the player took (served → answered)
  correct: boolean;
  onTime: boolean;
}

export interface SessionTimingStats {
  answers: number;
  correct: number;
  accuracy: number;         // correct / answers
  meanMs: number;
  minMs: number;
  fastCount: number;        // answers under SUSPICIOUS_FAST_MS
  fastFraction: number;     // fastCount / answers
  subFloorCount: number;    // answers under FAST_ANSWER_FLOOR_MS (impossible-for-human)
}

export type Verdict = "clean" | "suspect" | "flagged";

export interface Classification {
  verdict: Verdict;
  reasons: string[];
  stats: SessionTimingStats;
}

/** Aggregate a session's per-answer timings into summary stats. Pure. */
export function summarize(timings: AnswerTiming[]): SessionTimingStats {
  const n = timings.length;
  if (n === 0) {
    return { answers: 0, correct: 0, accuracy: 0, meanMs: 0, minMs: 0, fastCount: 0, fastFraction: 0, subFloorCount: 0 };
  }
  let correct = 0, sum = 0, min = Infinity, fast = 0, subFloor = 0;
  for (const t of timings) {
    if (t.correct) correct++;
    sum += t.responseMs;
    if (t.responseMs < min) min = t.responseMs;
    if (t.responseMs < SUSPICIOUS_FAST_MS) fast++;
    if (t.responseMs < FAST_ANSWER_FLOOR_MS) subFloor++;
  }
  return {
    answers: n,
    correct,
    accuracy: correct / n,
    meanMs: Math.round(sum / n),
    minMs: min === Infinity ? 0 : min,
    fastCount: fast,
    fastFraction: fast / n,
    subFloorCount: subFloor,
  };
}

/**
 * Classify a finished session from its timing stats. Pure — no DB, no env. The signer uses the
 * verdict (combined with enforcementOn()) to decide whether to sign.
 */
export function classify(stats: SessionTimingStats): Classification {
  const reasons: string[] = [];

  // Any physically-impossible answer time is on its own strong evidence of automation.
  if (stats.subFloorCount > 0) {
    reasons.push(`${stats.subFloorCount} answer(s) under ${FAST_ANSWER_FLOOR_MS}ms (not human-possible)`);
  }

  if (stats.answers >= FLAG_MIN_ANSWERS && stats.accuracy >= FLAG_ACCURACY) {
    if (stats.fastFraction >= FLAG_FAST_FRACTION) {
      reasons.push(`high accuracy (${(stats.accuracy * 100).toFixed(0)}%) with ${(stats.fastFraction * 100).toFixed(0)}% suspiciously-fast answers`);
    }
    if (stats.meanMs > 0 && stats.meanMs < FLAG_MEAN_MS) {
      reasons.push(`high accuracy (${(stats.accuracy * 100).toFixed(0)}%) with ${stats.meanMs}ms mean response`);
    }
  }

  let verdict: Verdict = "clean";
  if (stats.subFloorCount > 0) {
    verdict = "flagged"; // impossible timing → hard flag
  } else if (reasons.length >= 2) {
    verdict = "flagged"; // both accuracy+speed signals → flag
  } else if (reasons.length === 1) {
    verdict = "suspect"; // one signal → watch, don't block
  }

  return { verdict, reasons, stats };
}
