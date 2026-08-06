import { describe, it, expect, afterEach } from "vitest";
import {
  scoreCasualSession,
  casualPassMark,
  casualFailMark,
  casualMaxSteps,
  CASUAL_QUESTIONS,
  CASUAL_DEFAULT_PASS_MARK,
  CASUAL_DEFAULT_FAIL_MARK,
} from "./engine";
import { createSession, nextRound, scoreAnswer, finalMultiplierBp } from "./sessions";
import { getGame } from "./games/registry";

// The casual graduated pass-mark rework (2026-08-04): a Casual session is one round of 12 questions
// and the correct-count sets the multiplier ONCE, graduated by how far past a mark it lands —
// ≥9 → +0.1x per correct from the mark (9→1.1x … 12→1.4x), ≤4 → −0.1x per miss from the mark
// (4→0.9x … 0→0.5x), between → 1.0x. This replaces V1's per-question walk. V2 is untouched
// (server/v2/scoring.test.ts).

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("casual marks", () => {
  it("default to 9/12 pass and 4/12 fail", () => {
    delete process.env.CASUAL_PASS_MARK;
    delete process.env.CASUAL_FAIL_MARK;
    expect(CASUAL_QUESTIONS).toBe(12);
    expect(casualPassMark()).toBe(CASUAL_DEFAULT_PASS_MARK);
    expect(casualPassMark()).toBe(9);
    expect(casualFailMark()).toBe(CASUAL_DEFAULT_FAIL_MARK);
    expect(casualFailMark()).toBe(4);
  });

  it("expose the perfect-round step count (the on-chain payout-cap basis)", () => {
    delete process.env.CASUAL_PASS_MARK;
    expect(casualMaxSteps()).toBe(4); // 12 − 9 + 1 → 1.4x ceiling
  });

  it("are tunable without a redeploy", () => {
    process.env.CASUAL_PASS_MARK = "10";
    process.env.CASUAL_FAIL_MARK = "3";
    expect(casualPassMark()).toBe(10);
    expect(casualFailMark()).toBe(3);
    expect(casualMaxSteps()).toBe(3); // 12 − 10 + 1 → 1.3x ceiling
  });

  it("clamp the pass mark into 1..12", () => {
    process.env.CASUAL_PASS_MARK = "0";
    expect(casualPassMark()).toBe(1);
    process.env.CASUAL_PASS_MARK = "99";
    expect(casualPassMark()).toBe(CASUAL_QUESTIONS);
  });

  it("keep the fail mark strictly below the pass mark so the neutral zone survives", () => {
    process.env.CASUAL_PASS_MARK = "9";
    process.env.CASUAL_FAIL_MARK = "9"; // at/above pass would erase the neutral band
    expect(casualFailMark()).toBe(8);
    process.env.CASUAL_FAIL_MARK = "-5";
    expect(casualFailMark()).toBe(0);
  });

  it("fall back to defaults on malformed values", () => {
    process.env.CASUAL_PASS_MARK = "nine";
    process.env.CASUAL_FAIL_MARK = "four";
    expect(casualPassMark()).toBe(CASUAL_DEFAULT_PASS_MARK);
    expect(casualFailMark()).toBe(CASUAL_DEFAULT_FAIL_MARK);
  });
});

describe("scoreCasualSession — graduated per question past the mark", () => {
  it("gains +0.1x per correct from the pass mark up (9→1.1x … 12→1.4x)", () => {
    expect(scoreCasualSession(9)).toEqual({ multiplierBp: 11000, zone: "pass" });
    expect(scoreCasualSession(10)).toEqual({ multiplierBp: 12000, zone: "pass" });
    expect(scoreCasualSession(11)).toEqual({ multiplierBp: 13000, zone: "pass" });
    expect(scoreCasualSession(12)).toEqual({ multiplierBp: 14000, zone: "pass" });
  });

  it("loses 0.1x per miss from the fail mark down (4→0.9x … 0→0.5x)", () => {
    expect(scoreCasualSession(4)).toEqual({ multiplierBp: 9000, zone: "fail" });
    expect(scoreCasualSession(3)).toEqual({ multiplierBp: 8000, zone: "fail" });
    expect(scoreCasualSession(2)).toEqual({ multiplierBp: 7000, zone: "fail" });
    expect(scoreCasualSession(1)).toEqual({ multiplierBp: 6000, zone: "fail" });
    expect(scoreCasualSession(0)).toEqual({ multiplierBp: 5000, zone: "fail" });
  });

  it("holds at 1.0x in the neutral band (5..8)", () => {
    for (let c = 5; c <= 8; c++) {
      expect(scoreCasualSession(c)).toEqual({ multiplierBp: 10000, zone: "neutral" });
    }
  });

  it("never returns a negative multiplier even with punishing tuned marks", () => {
    process.env.CASUAL_PASS_MARK = "12";
    process.env.CASUAL_FAIL_MARK = "11";
    expect(scoreCasualSession(0).multiplierBp).toBeGreaterThanOrEqual(0);
  });
});

// ── End-to-end: a staked casual session settles on the graduated result, not the walk ───────────
const PLAYER = "0xabc0000000000000000000000000000000000002";

function playCasual(rightCount: number) {
  const game = getGame("trivia")!;
  // Casual shape: 12 questions served, maxRounds = graduated pass steps (4 → 1.4x cap).
  const s = createSession(game, PLAYER, /*maxRounds*/ casualMaxSteps(), "celo", undefined, {
    stake: 1,
    questions: CASUAL_QUESTIONS,
    difficulty: 0.5,
  });
  for (let i = 0; i < CASUAL_QUESTIONS; i++) {
    const view = nextRound(game, s)!;
    const correctIndex = s.current!.correctIndex;
    const pick = i < rightCount ? correctIndex : (correctIndex + 1) % view.options.length;
    scoreAnswer(s, pick);
  }
  return s;
}

describe("finalMultiplierBp — casual settles on the graduated pass mark", () => {
  it("signs the graduated pass multiplier within the on-chain 1.4x clamp", () => {
    expect(finalMultiplierBp(playCasual(9))).toBe(11000);
    expect(finalMultiplierBp(playCasual(12))).toBe(14000); // perfect = the exact cap
  });

  it("signs 1.0x for a neutral session", () => {
    expect(finalMultiplierBp(playCasual(6))).toBe(10000);
  });

  it("signs the graduated fail multiplier", () => {
    expect(finalMultiplierBp(playCasual(3))).toBe(8000);
    expect(finalMultiplierBp(playCasual(0))).toBe(5000);
  });
});
