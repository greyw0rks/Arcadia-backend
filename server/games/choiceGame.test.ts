import { describe, it, expect } from "vitest";
import { pickIndex, tieredPickIndex, tierNum } from "./choiceGame";

describe("pickIndex", () => {
  it("never repeats within a session while roundIndex < bankLength", () => {
    const len = 50;
    const seen = new Set<number>();
    for (let i = 0; i < len; i++) seen.add(pickIndex(len, i, 12345));
    expect(seen.size).toBe(len); // a full permutation, no repeats
  });

  it("orders differently for different seeds", () => {
    const a = Array.from({ length: 20 }, (_, i) => pickIndex(20, i, 1));
    const b = Array.from({ length: 20 }, (_, i) => pickIndex(20, i, 999));
    expect(a).not.toEqual(b);
  });
});

describe("tierNum", () => {
  it("maps tiers to 0/1/2 and defaults missing to medium (1)", () => {
    expect(tierNum("easy")).toBe(0);
    expect(tierNum("medium")).toBe(1);
    expect(tierNum("hard")).toBe(2);
    expect(tierNum(undefined)).toBe(1);
  });
});

describe("tieredPickIndex", () => {
  // Bank of 30: 10 easy, 10 medium, 10 hard.
  const tiers = [
    ...Array(10).fill(0),
    ...Array(10).fill(1),
    ...Array(10).fill(2),
  ];

  it("is still a no-repeat permutation for any difficulty", () => {
    for (const d of [0, 0.5, 1]) {
      const seen = new Set<number>();
      for (let i = 0; i < tiers.length; i++) seen.add(tieredPickIndex(tiers, i, 777, d));
      expect(seen.size).toBe(tiers.length);
    }
  });

  it("front-loads the EASY tier at low difficulty", () => {
    const first5 = Array.from({ length: 5 }, (_, i) => tieredPickIndex(tiers, i, 777, 0.1));
    // all of the first five picks are easy entries (indices 0..9)
    expect(first5.every((idx) => tiers[idx] === 0)).toBe(true);
  });

  it("front-loads the HARD tier at high difficulty", () => {
    const first5 = Array.from({ length: 5 }, (_, i) => tieredPickIndex(tiers, i, 777, 0.9));
    expect(first5.every((idx) => tiers[idx] === 2)).toBe(true);
  });

  it("front-loads the MEDIUM tier at mid difficulty", () => {
    const first5 = Array.from({ length: 5 }, (_, i) => tieredPickIndex(tiers, i, 777, 0.5));
    expect(first5.every((idx) => tiers[idx] === 1)).toBe(true);
  });

  it("falls back gracefully when a target tier is empty (all medium)", () => {
    const allMed = Array(15).fill(1);
    const seen = new Set<number>();
    for (let i = 0; i < allMed.length; i++) seen.add(tieredPickIndex(allMed, i, 5, 1)); // ask for hard
    expect(seen.size).toBe(allMed.length); // still a full no-repeat permutation
  });
});
