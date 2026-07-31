import { describe, it, expect } from "vitest";
import { classify, summarize, type AnswerTiming } from "../anticheat";
import { expectedAccuracy, implausibleAbove, isImplausiblyAccurate } from "./expectedAccuracy";

// The V1 classifier flags at a fixed 90% accuracy, which works when the difficulty floor keeps
// honest accuracy at 30–41%. §4.1 removes that floor: honest accuracy runs 51–65% by band, and a
// strong player in the recovery band expects ~87%. These tests pin the two failure modes that
// matters — flagging a good player who was served easy questions, and NOT flagging a bot that
// aced a round of extreme ones.

const EASY_ROUND = Array(15).fill(0);
const EXTREME_ROUND = Array(15).fill(3);
const BASELINE_ROUND = [...Array(6).fill(1), ...Array(7).fill(2), ...Array(2).fill(3)];

function timings(count: number, correct: number, ms: number): AnswerTiming[] {
  return Array.from({ length: count }, (_, i) => ({
    responseMs: ms,
    correct: i < correct,
    onTime: true,
  }));
}

describe("expectedAccuracy", () => {
  it("tracks the served difficulty", () => {
    expect(expectedAccuracy(EASY_ROUND)).toBeCloseTo(0.85, 2);
    expect(expectedAccuracy(EXTREME_ROUND)).toBeCloseTo(0.3, 2);
    expect(expectedAccuracy(BASELINE_ROUND)).toBeGreaterThan(0.45);
    expect(expectedAccuracy(BASELINE_ROUND)).toBeLessThan(0.6);
  });

  it("is 0 with no data rather than guessing", () => {
    expect(expectedAccuracy([])).toBe(0);
  });
});

describe("implausibleAbove", () => {
  it("allows a near-perfect score on easy questions", () => {
    // 85% expected × 1.45 skill ceiling exceeds 1, so the cap applies — a strong player scoring
    // 100% on easy questions must never be flagged on accuracy alone.
    expect(implausibleAbove(EASY_ROUND)).toBeGreaterThanOrEqual(0.98);
  });

  it("is far stricter on extreme questions than the old fixed 90%", () => {
    // This is the case a global threshold misses entirely: 80% on all-extreme questions is
    // wildly implausible, but sits under 90% and would pass unflagged.
    expect(implausibleAbove(EXTREME_ROUND)).toBeLessThan(0.9);
  });

  it("never drops below a coin-flip, so noise cannot flag anyone", () => {
    expect(implausibleAbove(EXTREME_ROUND)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("classify — difficulty-aware", () => {
  it("does NOT flag a strong player on a recovery-band round", () => {
    // The exact false positive that blocked enabling enforcement: an 87% score on the easiest
    // band, from a player who just busted and paid another $1.
    const stats = summarize(timings(15, 13, 3000)); // 87%, unhurried
    const verdict = classify(stats, { tiers: EASY_ROUND });
    expect(verdict.verdict).toBe("clean");
  });

  it("still flags impossible speed regardless of difficulty", () => {
    // No question is easy enough to answer in 200ms. Difficulty does not excuse this.
    const stats = summarize(timings(15, 15, 200));
    expect(classify(stats, { tiers: EASY_ROUND }).verdict).toBe("flagged");
  });

  it("catches a bot acing extreme questions that a fixed 90% would miss", () => {
    const stats = summarize(timings(15, 13, 800)); // 87% — under the old threshold
    const oldWay = classify(stats);                 // no tier context
    const newWay = classify(stats, { tiers: EXTREME_ROUND });
    expect(oldWay.verdict).toBe("clean");
    expect(newWay.verdict).not.toBe("clean");
  });

  it("preserves V1 behaviour exactly when no tier data is supplied", () => {
    const fast = summarize(timings(15, 15, 700));
    expect(classify(fast).verdict).toBe("flagged");
    const slow = summarize(timings(15, 8, 4000));
    expect(classify(slow).verdict).toBe("clean");
  });

  it("does not flag on absent tier data — math games carry none", () => {
    const stats = summarize(timings(15, 15, 3000)); // perfect but unhurried
    expect(classify(stats, { tiers: [] }).verdict).toBe("clean");
  });

  it("explains the expectation in the reason, so a review is possible", () => {
    const stats = summarize(timings(15, 14, 800));
    const v = classify(stats, { tiers: EXTREME_ROUND });
    expect(v.reasons.join(" ")).toMatch(/expected ~\d+%/);
  });
});

describe("isImplausiblyAccurate", () => {
  it("is false without tier data", () => {
    expect(isImplausiblyAccurate(1.0, { tiers: [] })).toBe(false);
  });

  it("scales with what was served", () => {
    expect(isImplausiblyAccurate(0.8, { tiers: EXTREME_ROUND })).toBe(true);
    expect(isImplausiblyAccurate(0.8, { tiers: EASY_ROUND })).toBe(false);
  });
});
