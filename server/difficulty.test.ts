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
    expect(difficultyFromStake(2.5, "celo")).toBeCloseTo(0.5);
    expect(difficultyFromStake(5, "celo")).toBe(1);
    expect(difficultyFromStake(99, "celo")).toBe(1); // clamped
    expect(difficultyFromStake(5, "stacks")).toBe(1); // fixed 5-STX cap
  });

  it("clamps an over-cap stake to d=1 (cannot buy past max difficulty)", () => {
    // A player who stakes above the cap can't push difficulty past 1 — and on-chain the contract
    // would reject the stake anyway (StakeTooHigh / ERR-STAKE-TOO-HIGH).
    expect(difficultyFromStake(5.000001, "celo")).toBe(1);
    expect(difficultyFromStake(1000, "stacks")).toBe(1);
  });
});

describe("MAX_STAKE cap", () => {
  it("the $5 display cap matches across both chains (mirrors the on-chain maxStake)", () => {
    expect(MAX_STAKE.celo).toBe(5);
    expect(MAX_STAKE.stacks).toBe(5);
  });
});

describe("difficultyFractionBaseUnits", () => {
  it("is rake-independent: d == stake/maxStake even though both are post-rake", () => {
    const maxStake = 5_000_000_000_000_000_000n; // 5e18 (cUSD base units)
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
    const maxStake = 5_000_000_000_000_000_000n;
    const eff = (maxStake * 9700n) / 10000n; // exactly at the cap, post-rake
    expect(difficultyFractionBaseUnits(eff, maxStake, DEFAULT_RAKE_BPS)).toBeCloseTo(1, 6);
  });

  it("clamps an over-cap effective stake to d=1", () => {
    const maxStake = 5_000_000_000_000_000_000n;
    const overEff = (maxStake * 2n * 9700n) / 10000n; // 2x the cap, post-rake
    expect(difficultyFractionBaseUnits(overEff, maxStake, DEFAULT_RAKE_BPS)).toBe(1);
  });

  // Multi-token: USDC/USDT are 6-decimal, so the maxStakeBase the /api/round route feeds into the
  // base-unit difficulty math must be parsed with 6 decimals (5e6), NOT cUSD's 18. Using the wrong
  // decimals would mis-scale difficulty for those tokens.
  it("works for a 6-decimal token (USDC/USDT): maxStakeBase is 5_000_000 and d scales correctly", () => {
    const maxStakeBase6 = parseUnits(String(MAX_STAKE.celo), 6);
    expect(maxStakeBase6).toBe(5_000_000n);

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
    expect(roundsFor(1, 5)).toBe(5); // tiny bank (e.g. movie)
    expect(roundsFor(1, 4)).toBe(4);
    // Below MIN_ROUNDS the floor still applies even at d=0.
    expect(roundsFor(0, 100000)).toBe(MIN_ROUNDS);
  });

  it("stays within the on-chain max-rounds cap, so the payout ceiling never exceeds the contract clamp", () => {
    const big = 100000;
    // The backend's own ceiling is well under the contract cap.
    expect(MAX_ROUNDS).toBeLessThanOrEqual(MAX_ROUNDS_CAP);
    // For any difficulty, roundsFor never asks for more rounds than the contract allows.
    for (const d of [0, 0.25, 0.5, 0.75, 1]) {
      const r = roundsFor(d, big);
      expect(r).toBeLessThanOrEqual(MAX_ROUNDS_CAP);
      // Implied max multiplier (bps) for that round count must be within the contract's clamp.
      const impliedMaxMul = BPS + STEP_BPS * r;
      const contractClamp = BPS + STEP_BPS * MAX_ROUNDS_CAP;
      expect(impliedMaxMul).toBeLessThanOrEqual(contractClamp);
    }
    // At max stake the ceiling is exactly 2.0x (10 rounds → 10000 + 1000*10 = 20000 bps).
    expect(BPS + STEP_BPS * roundsFor(1, big)).toBe(20000);
  });
});

describe("scaleTimer", () => {
  it("shrinks the base timer as difficulty rises, with a floor", () => {
    expect(scaleTimer(20, 0)).toBe(20); // full time at min stake
    expect(scaleTimer(20, 0.5)).toBe(16); // 20 * (1 - 0.4*0.5) = 16 at mid stake
    expect(scaleTimer(20, 1)).toBe(12); // 20 * (1 - 0.4) = 12 at max stake
    expect(scaleTimer(6, 1)).toBe(MIN_TIMER_SEC); // floored, never below MIN_TIMER_SEC
  });
});
