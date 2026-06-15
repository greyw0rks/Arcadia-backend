import { describe, it, expect } from "vitest";
import { listGameMeta, getGame } from "./registry";

// Directly guards the reported "questions repeat within a section" bug: for every registered game,
// a single session must serve DISTINCT prompts for as many rounds as the bank allows (up to a 10-round
// max session). This would have caught the legacy trivia picker and the 10-distinct-question capitals
// bank.
describe("no repeated prompts within a session", () => {
  for (const meta of listGameMeta()) {
    it(`${meta.id} serves distinct prompts across a session`, () => {
      const game = getGame(meta.id)!;
      const rounds = Math.min(10, meta.bankSize);
      const seed = 424242;
      const prompts: string[] = [];
      for (let i = 0; i < rounds; i++) {
        const view = game.buildRound(i, seed, 0.6).view;
        // Identify a question by prompt + image + its option SET. Some games share a static prompt
        // (oddoneout: "Which one doesn't belong?"; geo: "Where in the world is this?") and carry the
        // real content in the options/image, so prompt alone isn't a unique key. Options are sorted
        // because the per-round shuffle would otherwise make identical entries look distinct.
        const opts = [...view.options].sort().join("|");
        prompts.push(`${view.prompt}::${view.imageUrl ?? ""}::${opts}`);
      }
      expect(new Set(prompts).size).toBe(rounds);
    });
  }

  it("capitals now has many distinct countries (regression on the 10-dupe bank)", () => {
    const meta = listGameMeta().find((m) => m.id === "capitals")!;
    expect(meta.bankSize).toBeGreaterThan(100);
  });

  it("geo/landmark banks were expanded past the original 43", () => {
    const geo = listGameMeta().find((m) => m.id === "geo")!;
    const landmark = listGameMeta().find((m) => m.id === "landmark")!;
    expect(geo.bankSize).toBeGreaterThan(70);
    expect(landmark.bankSize).toBeGreaterThan(70);
  });
});
