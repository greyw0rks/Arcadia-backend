import { describe, it, expect, afterEach } from "vitest";
import {
  ROUND_STEP,
  DEFAULT_PASS_MARK,
  QUESTIONS_PER_ROUND,
  passMark,
  scoreRound,
  applyRound,
  isBust,
} from "./scoring";

const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; });

describe("pass mark", () => {
  it("defaults to 9 — the signed-off value (~24% bust)", () => {
    delete process.env.V2_PASS_MARK;
    expect(passMark()).toBe(DEFAULT_PASS_MARK);
    expect(DEFAULT_PASS_MARK).toBe(9);
  });

  it("is tunable without a redeploy", () => {
    process.env.V2_PASS_MARK = "11";
    expect(passMark()).toBe(11);
  });

  it("clamps out-of-range values instead of degenerating the mechanic", () => {
    // Below 1 every round gains; above 15 no round ever can. Both break the economy silently,
    // and this reads from an env var that moves real money.
    process.env.V2_PASS_MARK = "0";
    expect(passMark()).toBe(1);
    process.env.V2_PASS_MARK = "99";
    expect(passMark()).toBe(QUESTIONS_PER_ROUND);
  });

  it("falls back to the default on a malformed value", () => {
    process.env.V2_PASS_MARK = "nine";
    expect(passMark()).toBe(DEFAULT_PASS_MARK);
  });
});

describe("scoreRound — free rounds are symmetric", () => {
  it("gains at exactly the pass mark", () => {
    expect(scoreRound(9).delta).toBe(ROUND_STEP);
    expect(scoreRound(9).passed).toBe(true);
  });

  it("loses one below it", () => {
    expect(scoreRound(8).delta).toBe(-ROUND_STEP);
    expect(scoreRound(8).passed).toBe(false);
  });

  it("moves by one step regardless of margin — score sets pass/fail, not size", () => {
    // This is the whole mechanic: 70 events of 0.10x, not 1,050 of 0.01x.
    expect(scoreRound(15).delta).toBe(scoreRound(9).delta);
    expect(scoreRound(0).delta).toBe(scoreRound(8).delta);
  });
});

describe("scoreRound — purchased rounds are upside-only", () => {
  it("gains like a free round when passed", () => {
    expect(scoreRound(12, { purchased: true }).delta).toBe(ROUND_STEP);
  });

  it("never subtracts when failed", () => {
    // Safety property, not balance: under symmetric scoring a player spending $14/week raises
    // their own bust probability by ~8 points while the platform rakes every ticket.
    const out = scoreRound(3, { purchased: true });
    expect(out.delta).toBe(0);
    expect(out.lossWaived).toBe(true);
  });

  it("buying rounds can never make a player worse off than not buying", () => {
    for (let correct = 0; correct <= QUESTIONS_PER_ROUND; correct++) {
      expect(scoreRound(correct, { purchased: true }).delta)
        .toBeGreaterThanOrEqual(scoreRound(correct).delta);
    }
  });
});

describe("applyRound", () => {
  it("does not accumulate float drift across a week of rounds", () => {
    // 0.1 + 0.2 !== 0.3 in binary float, and this number decides a payout.
    let m = 1.0;
    for (let i = 0; i < 70; i++) m = applyRound(m, scoreRound(15));
    expect(m).toBe(8.0);
  });

  it("floors at zero rather than going negative", () => {
    expect(applyRound(0.05, scoreRound(0))).toBe(0);
  });

  it("round trips a gain and a loss back to the starting value", () => {
    expect(applyRound(applyRound(1.0, scoreRound(15)), scoreRound(0))).toBe(1.0);
  });
});

describe("bust", () => {
  it("is the multiplier reaching zero", () => {
    expect(isBust(0)).toBe(true);
    expect(isBust(0.1)).toBe(false);
  });

  it("is reachable from the baseline in exactly 10 failed rounds", () => {
    let m = 1.0;
    let rounds = 0;
    while (!isBust(m)) { m = applyRound(m, scoreRound(0)); rounds++; }
    expect(rounds).toBe(10);
  });
});
