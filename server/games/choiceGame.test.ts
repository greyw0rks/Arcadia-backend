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
  // Bank: 10 easy, 10 medium, 10 hard, 10 extreme = 40 entries.
  const tiers = [
    ...Array(10).fill(0),
    ...Array(10).fill(1),
    ...Array(10).fill(2),
    ...Array(10).fill(3),
  ];

  it("is a no-repeat permutation for any difficulty", () => {
    for (const d of [0, 0.5, 1]) {
      const seen = new Set<number>();
      for (let i = 0; i < tiers.length; i++) seen.add(tieredPickIndex(tiers, i, 777, d));
      expect(seen.size).toBe(tiers.length);
    }
  });

  // Tier recipes for 7 rounds (one block = one shuffled copy of the recipe):
  // easy   (d<0.25): [0,0,0,1,1,2,3] → 3 easy, 2 medium, 1 hard, 1 extreme
  // hard   (0.25≤d<0.5): [0,1,1,2,2,2,3] → 1 easy, 3 medium, 2 hard, 1 extreme (wait, same seed, check)
  // v-hard (0.5≤d<0.75): [1,2,2,2,3,3,3] → 0 easy, 1 medium, 3 hard, 3 extreme
  // extreme(d≥0.75):     [2,3,3,3,3,3,3] → 0 easy, 0 medium, 1 hard, 6 extreme

  it("easy sessions (d<0.25) give exactly 3 easy, 2 medium, 1 hard, 1 extreme across 7 rounds", () => {
    const picks = Array.from({ length: 7 }, (_, i) => tieredPickIndex(tiers, i, 42, 0.1));
    const counts = [0, 0, 0, 0];
    for (const idx of picks) counts[tiers[idx]]++;
    expect(counts[0]).toBe(3); // easy
    expect(counts[1]).toBe(2); // medium
    expect(counts[2]).toBe(1); // hard
    expect(counts[3]).toBe(1); // extreme
  });

  it("very hard sessions (0.5≤d<0.75) give exactly 1 medium, 3 hard, 3 extreme across 7 rounds", () => {
    const picks = Array.from({ length: 7 }, (_, i) => tieredPickIndex(tiers, i, 42, 0.5));
    const counts = [0, 0, 0, 0];
    for (const idx of picks) counts[tiers[idx]]++;
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(1); // medium
    expect(counts[2]).toBe(3); // hard
    expect(counts[3]).toBe(3); // extreme
  });

  it("extreme sessions (d≥0.75) give exactly 1 hard, 6 extreme across 7 rounds", () => {
    const picks = Array.from({ length: 7 }, (_, i) => tieredPickIndex(tiers, i, 42, 0.9));
    const counts = [0, 0, 0, 0];
    for (const idx of picks) counts[tiers[idx]]++;
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(0); // medium
    expect(counts[2]).toBe(1); // hard
    expect(counts[3]).toBe(6); // extreme
  });

  it("different seeds produce different orderings for the same difficulty", () => {
    const a = Array.from({ length: 7 }, (_, i) => tieredPickIndex(tiers, i, 1, 0.5));
    const b = Array.from({ length: 7 }, (_, i) => tieredPickIndex(tiers, i, 999, 0.5));
    expect(a).not.toEqual(b);
  });

  it("falls back gracefully when a target tier is empty (all medium bank)", () => {
    const allMed = Array(15).fill(1);
    const seen = new Set<number>();
    for (let i = 0; i < allMed.length; i++) seen.add(tieredPickIndex(allMed, i, 5, 1));
    expect(seen.size).toBe(allMed.length);
  });
});
