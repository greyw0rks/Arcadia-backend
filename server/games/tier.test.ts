import { describe, it, expect } from "vitest";
import { listGameMeta, getGame } from "./registry";
import { drawTiered } from "./choiceGame";

// The V2 difficulty model's four free parameters are the per-tier accuracies (spec §4.1). Measuring
// them requires knowing which tier each served question came from — so a round that reaches scoring
// without a tier is a silently lost data point, not a visible failure. These guard that.

const PROCEDURAL = new Set(["math"]); // generates questions; has no tagged bank, so no tier

describe("served rounds carry the tier they were drawn from", () => {
  for (const meta of listGameMeta()) {
    if (PROCEDURAL.has(meta.id)) continue;

    it(`${meta.id} reports a tier on every round`, () => {
      const game = getGame(meta.id)!;
      const rounds = Math.min(10, meta.bankSize);
      for (let i = 0; i < rounds; i++) {
        const tier = game.buildRound(i, 424242, 0.6).tier;
        expect(tier, `${meta.id} round ${i} served without a tier`).toBeTypeOf("number");
        expect(tier).toBeGreaterThanOrEqual(0);
        expect(tier).toBeLessThanOrEqual(3);
      }
    });
  }

  it("math reports no tier — it has no bank to draw one from", () => {
    expect(getGame("math")!.buildRound(0, 424242, 0.6).tier).toBeUndefined();
  });

  // The recorded tier has to be the tier that was actually served, not a constant. If it were
  // detached from the difficulty schedule, per-tier accuracy would still populate and still be
  // wrong — the failure mode this catches.
  it("the recorded tier tracks the session's difficulty", () => {
    const game = getGame("trivia")!;
    const meanTier = (difficulty: number) => {
      const tiers: number[] = [];
      for (let seed = 1; seed <= 20; seed++) {
        for (let i = 0; i < 7; i++) tiers.push(game.buildRound(i, seed * 7919, difficulty).tier!);
      }
      return tiers.reduce((a, b) => a + b, 0) / tiers.length;
    };
    expect(meanTier(1)).toBeGreaterThan(meanTier(0));
  });
});

describe("drawTiered", () => {
  it("returns the tier belonging to the entry it returned", () => {
    const bank = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const tiers = [0, 1, 2, 3, 0, 1, 2, 3];
    for (let i = 0; i < bank.length; i++) {
      const { entry, tier } = drawTiered(bank, tiers, i, 12345, 0.5);
      expect(tier).toBe(tiers[bank.indexOf(entry)]);
    }
  });
});
