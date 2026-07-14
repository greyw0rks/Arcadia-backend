import { describe, it, expect } from "vitest";
import { parseUnits } from "viem";
import {
  BPS,
  STEP_BPS,
  MAX_STAKE,
  MIN_ROUNDS,
  MAX_ROUNDS,
  MAX_ROUNDS_CAP,
  MIN_TIMER_SEC,
  DEFAULT_RAKE_BPS,
  difficultyFromStake,
  difficultyFractionBaseUnits,
  roundsFor,
  scaleTimer,
} from "./difficulty";

describe("difficultyFromStake", () => {
  it("is 0 at no stake and 1 at the cap, clamped", () => {
    expect(difficultyFromStake(0, "celo")).toBe(0);
    expect(difficultyFromStake(0.5, "celo")).toBeCloseTo(0.5);
    expect(difficultyFromStake(1, "celo")).toBe(1);
    expect(difficultyFromStake(99, "celo")).toBe(1); // clamped
  });

  it("clamps an over-cap stake to d=1 (cannot buy past max difficulty)", () => {
    expect(difficultyFromStake(1.000001, "celo")).toBe(1);
  });
});

describe("MAX_STAKE cap", () => {
  it("$1 display cap (mirrors the on-chain maxStake)", () => {
    expect(MAX_STAKE.celo).toBe(1);
  });
});

describe("difficultyFractionBaseUnits", () => {
  it("is rake-independent: d == stake/maxStake even though both are post-rake", () => {
    const maxStake = 1_000_000_000_000_000_000n; // 1e18 (cUSD base units)
    const eff = (s: bigint) => (s * BigInt(10000 - DEFAULT_RAKE_BPS)) / 10000n;
    expect(
      difficultyFractionBaseUnits(eff(maxStake), maxStake, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(1, 4);
    expect(
      difficultyFractionBaseUnits(eff(maxStake / 2n), maxStake, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(0.5, 4);
    expect(difficultyFractionBaseUnits(0n, maxStake, DEFAULT_RAKE_BPS)).toBe(0);
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
    expect(
      difficultyFractionBaseUnits(eff(maxStakeBase6), maxStakeBase6, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(1, 4);
    expect(
      difficultyFractionBaseUnits(eff(maxStakeBase6 / 2n), maxStakeBase6, DEFAULT_RAKE_BPS)
    ).toBeCloseTo(0.5, 4);
    expect(difficultyFractionBaseUnits(0n, maxStakeBase6, DEFAULT_RAKE_BPS)).toBe(0);
  });
});

describe("roundsFor", () => {
  it("scales from MIN_ROUNDS to MAX_ROUNDS with the bet", () => {
    const big = 100000; // a bank that never caps
    expect(roundsFor(0, big)).toBe(MIN_ROUNDS);
    expect(roundsFor(1, big)).toBe(MAX_ROUNDS);
    expect(roundsFor(0.5, big)).toBe(Math.round((MIN_ROUNDS + MAX_ROUNDS) / 2));
  });

  it("never exceeds the game's question bank (no in-session repeats)", () => {
    expect(roundsFor(1, 5)).toBe(5); // tiny bank (e.g. movie stills) — caps below MIN_ROUNDS
    expect(roundsFor(1, 4)).toBe(4);
    expect(roundsFor(0, 100000)).toBe(MIN_ROUNDS); // large bank: floor is MIN_ROUNDS
  });

  it("stays within the on-chain max-rounds cap, so the payout ceiling never exceeds the contract clamp", () => {
    const big = 100000;
    expect(MAX_ROUNDS).toBeLessThanOrEqual(MAX_ROUNDS_CAP);
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      const r = roundsFor(d, big);
      expect(r).toBeLessThanOrEqual(MAX_ROUNDS_CAP);
      const impliedMaxMul = BPS + STEP_BPS * r;
      const contractClamp = BPS + STEP_BPS * MAX_ROUNDS_CAP;
      expect(impliedMaxMul).toBeLessThanOrEqual(contractClamp);
    }
    // At max stake the ceiling is MAX_ROUNDS (currently 15): 10000 + 1000*15 = 25000 bps.
    expect(BPS + STEP_BPS * roundsFor(1, big)).toBe(BPS + STEP_BPS * MAX_ROUNDS);
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
