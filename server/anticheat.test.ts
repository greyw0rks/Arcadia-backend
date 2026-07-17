import { describe, it, expect } from "vitest";
import {
  summarize,
  classify,
  FAST_ANSWER_FLOOR_MS,
  type AnswerTiming,
} from "./anticheat";

const t = (responseMs: number, correct = true, onTime = true): AnswerTiming => ({ responseMs, correct, onTime });

describe("summarize", () => {
  it("computes accuracy, mean, min, and fast counts", () => {
    const s = summarize([t(3000), t(4000, false), t(200), t(5000)]);
    expect(s.answers).toBe(4);
    expect(s.correct).toBe(3);
    expect(s.accuracy).toBeCloseTo(0.75);
    expect(s.minMs).toBe(200);
    expect(s.subFloorCount).toBe(1); // the 200ms answer
  });

  it("is empty-safe", () => {
    const s = summarize([]);
    expect(s.answers).toBe(0);
    expect(s.accuracy).toBe(0);
  });
});

describe("classify", () => {
  it("clean: a normal human game (varied 2-6s, some wrong)", () => {
    const c = classify(summarize([t(3200), t(4800, false), t(2600), t(5100), t(3900)]));
    expect(c.verdict).toBe("clean");
    expect(c.reasons).toHaveLength(0);
  });

  it("flagged: any sub-floor (impossible) answer time", () => {
    const c = classify(summarize([t(3000), t(200), t(4000)]));
    expect(c.verdict).toBe("flagged");
    expect(c.reasons[0]).toContain(`under ${FAST_ANSWER_FLOOR_MS}ms`);
  });

  it("flagged: perfect accuracy + consistently fast (the AI signature)", () => {
    // 6 answers, all correct, all ~600ms → high accuracy + high fast-fraction + low mean = 2 signals
    const c = classify(summarize([t(600), t(650), t(580), t(620), t(700), t(590)]));
    expect(c.verdict).toBe("flagged");
    expect(c.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it("suspect (not flagged): fast + accurate but only one signal trips", () => {
    // All correct, mean ~1100ms (trips the low-mean signal) but no answer under 900ms
    // (fast-fraction 0, so the fast-fraction signal does NOT trip) → single signal → suspect.
    const c = classify(summarize([t(950), t(1100), t(1150), t(1100), t(1200)]));
    expect(c.verdict).toBe("suspect");
    expect(c.reasons).toHaveLength(1);
  });

  it("clean: fast but inaccurate (a guesser, not an AI)", () => {
    // Fast answers but only 40% correct → accuracy gate not met → clean
    const c = classify(summarize([t(700), t(650, false), t(600, false), t(680, false), t(620)]));
    expect(c.verdict).toBe("clean");
  });

  it("does not flag ultra-short sessions on the accuracy rule alone", () => {
    // 2 fast correct answers — below FLAG_MIN_ANSWERS, and not sub-floor → not flagged by accuracy
    const c = classify(summarize([t(600), t(650)]));
    expect(c.verdict).not.toBe("flagged");
  });
});
