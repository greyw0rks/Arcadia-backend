import { describe, it, expect } from "vitest";
import { parseUnits } from "viem";
import {
  BPS,
  STEP_BPS,
  MAX_STAKE,
  MIN_STAKE,
  MIN_DIFFICULTY,
  MAX_ROUNDS_CAP,
  MIN_TIMER_SEC,
  DEFAULT_RAKE_BPS,
  difficultyFromStake,
  difficultyFractionBaseUnits,
  rawStakeFraction,
  scaleTimer,
} from "./difficulty";
import { casualMaxSteps } from "./engine";

describe("difficultyFromStake", () => {
  it("applies the floor at no stake and reaches 1 at the cap, clamped", () => {
    expect(difficultyFromStake(0, "celo")).toBe(MIN_DIFFICULTY);
    expect(difficultyFromStake(0.5, "celo")).toBeCloseTo(MIN_DIFFICULTY + (1 - MIN_DIFFICULTY) * 0.5);
    expect(difficultyFromStake(1, "celo")).toBe(1);
    expect(difficultyFromStake(99, "celo")).toBe(1); // clamped
  });

  it("clamps an over-cap stake to d=1 (cannot buy past max difficulty)", () => {
    expect(difficultyFromStake(1.000001, "celo")).toBe(1);
  });

  it("never drops below the difficulty floor (closes the low-stake drain)", () => {
    for (const s of [0, 0.01, 0.1, 0.25]) {
      expect(difficultyFromStake(s, "celo")).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
    }
  });
});

describe("MAX_STAKE cap", () => {
  it("$1 display cap (mirrors the on-chain maxStake)", () => {
    expect(MAX_STAKE.celo).toBe(1);
  });
});

describe("MIN_STAKE floor", () => {
  it("$0.10 minimum bet, below the max", () => {
    expect(MIN_STAKE.celo).toBe(0.1);
    expect(MIN_STAKE.celo).toBeLessThan(MAX_STAKE.celo);
    expect(MIN_STAKE.celo).toBeGreaterThan(0);
  });
});

describe("rawStakeFraction", () => {
  it("is the un-floored stake/MAX_STAKE ratio, clamped to [0,1]", () => {
    expect(rawStakeFraction(0, "celo")).toBe(0);
    expect(rawStakeFraction(0.1, "celo")).toBeCloseTo(0.1);
    expect(rawStakeFraction(0.5, "celo")).toBeCloseTo(0.5);
    expect(rawStakeFraction(1, "celo")).toBe(1);
    expect(rawStakeFraction(2, "celo")).toBe(1); // clamped
  });
});

describe("difficultyFractionBaseUnits", () => {
  it("is rake-independent and floored: d remaps stake/maxStake onto [MIN_DIFFICULTY, 1]", () => {
    const maxStake = 1_000_000_000_000_000_000n; // 1e18 (cUSD base units)
    const eff = (s: bigint) => (s * BigInt(10000 - DEFAULT_RAKE_BPS)) / 10000n;
    const floored = (f: number) => MIN_DIFFICULTY + (1 - MIN_DIFFICULTY) * f;
    expect(
      difficultyFractionBaseUnits(eff(maxStake), maxStake, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(1, 4);
    expect(
      difficultyFractionBaseUnits(eff(maxStake / 2n), maxStake, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(floored(0.5), 4);
    expect(difficultyFractionBaseUnits(0n, maxStake, DEFAULT_RAKE_BPS)).toBe(MIN_DIFFICULTY);
  });

  it("does not lose precision on 18-decimal stakes", () => {
    const maxStake = 1_000_000_000_000_000_000n;
    const eff = (maxStake * 9700n) / 10000n; // exactly at the cap, post-rake
    expect(difficultyFractionBaseUnits(eff, maxStake, DEFAULT_RAKE_BPS)).toBeCloseTo(1, 6);
  });

  it("clamps an over-cap effective stake to d=1", () => {
    const maxStake = 1_000_000_000_000_000_000n;
    const overEff = (maxStake * 2n * 9700n) / 10000n; // 2x the cap, post-rake
    expect(difficultyFractionBaseUnits(overEff, maxStake, DEFAULT_RAKE_BPS)).toBe(1);
  });

  // Multi-token: USDC/USDT are 6-decimal, so the maxStakeBase the /api/round route feeds into the
  // base-unit difficulty math must be parsed with 6 decimals (5e6), NOT cUSD's 18. Using the wrong
  // decimals would mis-scale difficulty for those tokens.
  it("works for a 6-decimal token (USDC/USDT): maxStakeBase is 1_000_000 and d scales correctly", () => {
    const maxStakeBase6 = parseUnits(String(MAX_STAKE.celo), 6);
    expect(maxStakeBase6).toBe(1_000_000n);

    const eff = (s: bigint) => (s * BigInt(10000 - DEFAULT_RAKE_BPS)) / 10000n;
    const floored = (f: number) => MIN_DIFFICULTY + (1 - MIN_DIFFICULTY) * f;
    expect(
      difficultyFractionBaseUnits(eff(maxStakeBase6), maxStakeBase6, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(1, 4);
    expect(
      difficultyFractionBaseUnits(eff(maxStakeBase6 / 2n), maxStakeBase6, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(floored(0.5), 4);
    expect(difficultyFractionBaseUnits(0n, maxStakeBase6, DEFAULT_RAKE_BPS)).toBe(MIN_DIFFICULTY);
  });
});

describe("casual payout ceiling vs the on-chain clamp", () => {
  it("never lets a perfect round imply a multiplier above the contract's cap", () => {
    // A casual session commits maxRounds = casualMaxSteps(), and QuizArcadeV2 rejects any
    // maxRounds above maxRoundsCap at startSession. If a tuned pass mark ever pushed the step
    // count past the cap, every session would revert on entry.
    expect(casualMaxSteps()).toBeLessThanOrEqual(MAX_ROUNDS_CAP);
    const impliedMaxMul = BPS + STEP_BPS * casualMaxSteps();
    expect(impliedMaxMul).toBeLessThanOrEqual(BPS + STEP_BPS * MAX_ROUNDS_CAP);
  });
});

describe("scaleTimer", () => {
  it("shrinks the base timer as difficulty rises, with a floor", () => {
    // TIMER_SHRINK = 0.75: timer = round(base * (1 - 0.75 * d)), floored at MIN_TIMER_SEC.
    expect(scaleTimer(20, 0)).toBe(20);   // d=0: no shrink
    expect(scaleTimer(20, 0.5)).toBe(13); // round(20 * 0.625) = 13
    expect(scaleTimer(20, 1)).toBe(5);    // round(20 * 0.25) = 5
    expect(scaleTimer(6, 1)).toBe(MIN_TIMER_SEC); // round(6 * 0.25)=2 → floored to MIN_TIMER_SEC
  });
});
