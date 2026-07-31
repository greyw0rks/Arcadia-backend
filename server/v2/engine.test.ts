import { describe, it, expect } from "vitest";
import { tallyWeek, bestMultiplierBp } from "./tally";
import { buildTree, leafFor, verifyProof } from "./merkle";
import { bandFor, tierSlots, BANDS } from "./bands";
import { tieredPickIndex } from "../games/choiceGame";

const A = "0x1111111111111111111111111111111111111111" as const;
const B = "0x2222222222222222222222222222222222222222" as const;
const C = "0x3333333333333333333333333333333333333333" as const;

describe("tally — the pot is the ceiling", () => {
  it("never allocates more than the pot", () => {
    const pot = 1_000_000n;
    const r = tallyWeek(pot, [
      { player: A, bestBp: 30000 },
      { player: B, bestBp: 10000 },
      { player: C, bestBp: 7000 },
    ]);
    expect(r.totalPayout).toBeLessThanOrEqual(pot);
    expect(r.totalPayout + r.remainder).toBe(pot);
  });

  it("holds the ceiling across awkward pot/multiplier combinations", () => {
    // Integer division truncates, so the sum can only come in UNDER the pot. That direction is
    // what matters — over-allocating is rejected on-chain and would strand the week.
    for (const pot of [1n, 7n, 999n, 1_000_000_000_000_000_000n, 123_456_789n]) {
      for (const bps of [[10000], [10000, 10000, 10000], [33333, 1, 99999], [10000, 20000]]) {
        const r = tallyWeek(pot, bps.map((bp, i) => ({ player: `0x${String(i).repeat(40)}`, bestBp: bp })));
        expect(r.totalPayout).toBeLessThanOrEqual(pot);
        expect(r.totalPayout + r.remainder).toBe(pot);
      }
    }
  });

  it("pays proportionally to the multiplier", () => {
    const r = tallyWeek(300n, [
      { player: A, bestBp: 20000 }, // 2.0x
      { player: B, bestBp: 10000 }, // 1.0x
    ]);
    const a = r.shares.find((s) => s.player === A)!;
    const b = r.shares.find((s) => s.player === B)!;
    expect(a.amount).toBe(200n);
    expect(b.amount).toBe(100n);
  });
});

describe("tally — busted players", () => {
  it("pays a busted player nothing and redistributes their stake", () => {
    const r = tallyWeek(1000n, [
      { player: A, bestBp: 10000 },
      { player: B, bestBp: 0 }, // busted
    ]);
    expect(r.shares.find((s) => s.player === B)).toBeUndefined();
    // A takes the whole pot including B's forfeited entry — it goes to the pool, not the platform.
    expect(r.shares.find((s) => s.player === A)!.amount).toBe(1000n);
  });

  it("returns no shares when everybody busted, leaving the pot to roll forward", () => {
    const r = tallyWeek(5000n, [
      { player: A, bestBp: 0 },
      { player: B, bestBp: 0 },
    ]);
    expect(r.shares).toEqual([]);
    expect(r.totalPayout).toBe(0n);
    expect(r.remainder).toBe(5000n);
  });

  it("drops shares that round to zero rather than emitting unclaimable leaves", () => {
    // A tiny pot split many ways: some shares truncate to 0 and must not become leaves.
    const r = tallyWeek(2n, [
      { player: A, bestBp: 10000 },
      { player: B, bestBp: 1 },
      { player: C, bestBp: 1 },
    ]);
    expect(r.shares.every((s) => s.amount > 0n)).toBe(true);
  });
});

describe("bestMultiplierBp", () => {
  it("ignores busted runs entirely, however high they climbed", () => {
    // A run that reached 3.0x and then busted is worth 0, not 3.0x. Bust has to be a real loss or
    // the mechanic has no teeth — so this player is credited only their live 1.0x rebuy.
    expect(bestMultiplierBp([
      { multiplierBp: 30000, busted: true },
      { multiplierBp: 10000, busted: false },
    ])).toBe(10000);
  });

  it("takes the best surviving run rather than the most recent", () => {
    // Crediting the LAST run would punish a Sunday-evening rebuy — exactly the behaviour the
    // rebuy mechanic exists to encourage.
    expect(bestMultiplierBp([
      { multiplierBp: 25000, busted: false },
      { multiplierBp: 10000, busted: false },
    ])).toBe(25000);
  });

  it("scores 0 when every run busted", () => {
    expect(bestMultiplierBp([{ multiplierBp: 30000, busted: true }])).toBe(0);
  });

  it("scores 0 for a player with no runs", () => {
    expect(bestMultiplierBp([])).toBe(0);
  });
});

describe("merkle — must match ArcadiaPool", () => {
  it("every generated proof verifies against the root", () => {
    const entries = [
      { player: A, amount: 100n },
      { player: B, amount: 250n },
      { player: C, amount: 7n },
    ];
    const tree = buildTree(1n, entries);
    for (const e of entries) {
      const proof = tree.proofs.get(e.player.toLowerCase())!;
      expect(verifyProof(tree.root, leafFor(1n, e.player, e.amount), proof)).toBe(true);
    }
  });

  it("verifies for tree sizes 1..12, including odd levels", () => {
    for (let n = 1; n <= 12; n++) {
      const entries = Array.from({ length: n }, (_, i) => ({
        player: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
        amount: BigInt(i + 1) * 10n,
      }));
      const tree = buildTree(9n, entries);
      for (const e of entries) {
        const proof = tree.proofs.get(e.player.toLowerCase())!;
        expect(
          verifyProof(tree.root, leafFor(9n, e.player, e.amount), proof),
          `size ${n} failed for ${e.player}`
        ).toBe(true);
      }
    }
  });

  it("is deterministic regardless of input order", () => {
    const entries = [
      { player: C, amount: 7n },
      { player: A, amount: 100n },
      { player: B, amount: 250n },
    ];
    const a = buildTree(1n, entries);
    const b = buildTree(1n, [...entries].reverse());
    expect(a.root).toBe(b.root);
  });

  it("changes root when weekId changes — proofs cannot cross weeks", () => {
    const entries = [{ player: A, amount: 100n }, { player: B, amount: 100n }];
    expect(buildTree(1n, entries).root).not.toBe(buildTree(2n, entries).root);
  });

  it("rejects a forged amount", () => {
    const tree = buildTree(1n, [{ player: A, amount: 100n }, { player: B, amount: 100n }]);
    const proof = tree.proofs.get(A.toLowerCase())!;
    expect(verifyProof(tree.root, leafFor(1n, A, 999n), proof)).toBe(false);
  });

  it("refuses duplicate or non-positive entries", () => {
    expect(() => buildTree(1n, [{ player: A, amount: 1n }, { player: A, amount: 2n }])).toThrow(/duplicate/);
    expect(() => buildTree(1n, [{ player: A, amount: 0n }])).toThrow(/non-positive/);
    expect(() => buildTree(1n, [])).toThrow(/no payouts/);
  });

  it("totalPayout equals the sum of the leaves", () => {
    const tree = buildTree(1n, [{ player: A, amount: 100n }, { player: B, amount: 250n }]);
    expect(tree.totalPayout).toBe(350n);
  });
});

describe("difficulty bands — §4.1", () => {
  it("serves easy questions only near bust, and extreme only when ahead", () => {
    expect(bandFor(3000).recipe[0]).toBeGreaterThan(0);   // recovery has easy
    expect(bandFor(3000).recipe[3]).toBe(0);              // …and no extreme
    expect(bandFor(30000).recipe[0]).toBe(0);             // elite has no easy
    expect(bandFor(30000).recipe[3]).toBeGreaterThan(0);  // …and plenty of extreme
  });

  it("gets harder as the multiplier climbs", () => {
    const weight = (bp: number) =>
      bandFor(bp).recipe.reduce((sum, count, tier) => sum + count * tier, 0);
    const points = [3000, 7000, 10000, 14000, 19000, 30000];
    for (let i = 1; i < points.length; i++) {
      expect(weight(points[i])).toBeGreaterThan(weight(points[i - 1]));
    }
  });

  it("gives a busted player the recovery recipe, not the hardest one", () => {
    expect(bandFor(0).label).toBe("recovery");
  });

  it("every recipe is exactly one round of 15 questions", () => {
    for (const band of BANDS) {
      expect(band.recipe.reduce((a, b) => a + b, 0), band.label).toBe(15);
    }
  });

  it("produces 15 slots matching the band's recipe", () => {
    const slots = tierSlots(10000, 42);
    expect(slots).toHaveLength(15);
    const counts = [0, 0, 0, 0];
    slots.forEach((t) => counts[t]++);
    expect(counts).toEqual([...bandFor(10000).recipe]);
  });

  it("is deterministic in the seed, so a round cannot be re-rolled", () => {
    expect(tierSlots(10000, 7)).toEqual(tierSlots(10000, 7));
    expect(tierSlots(10000, 7)).not.toEqual(tierSlots(10000, 8));
  });

  // The schedule being correct is not enough — it has to survive the picker. Passing a V2 band
  // through the bet-scaled `difficulty` argument instead silently inverted the curve: recovery's
  // [4,7,4,0] was served as [0,0,11,4], the hardest questions to the players closest to bust.
  // V1's TIER_RECIPES never serve easy or medium at any difficulty, so no fraction can express these.
  it("is honoured by the picker, for every band", () => {
    const bank = Array.from({ length: 400 }, (_, i) => i % 4);
    for (const band of BANDS) {
      const mid = Math.min(band.maxBp - 1, band.minBp + 100);
      const counts = [0, 0, 0, 0];
      const schedule = tierSlots(mid, 4242);
      for (let r = 0; r < 15; r++) {
        counts[bank[tieredPickIndex(bank, r, 999, 0, schedule)]]++;
      }
      expect(counts, band.label).toEqual([...band.recipe]);
    }
  });

  it("leaves V1 untouched when no schedule is given", () => {
    const bank = Array.from({ length: 400 }, (_, i) => i % 4);
    for (let r = 0; r < 15; r++) {
      expect(tieredPickIndex(bank, r, 999, 0.8)).toBe(
        tieredPickIndex(bank, r, 999, 0.8, undefined)
      );
    }
  });
});
