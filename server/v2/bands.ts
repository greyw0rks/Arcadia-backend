// server/v2/bands.ts — the §4.1 difficulty curve.
//
// Difficulty is a function of the player's CURRENT MULTIPLIER, not of what they paid. There is one
// flat $1 entry, so the only difficulty axis is how well the player is doing — a self-correcting
// equilibrium where a player near bust gets a genuine chance to recover and a player running hot
// faces questions that pull them back toward breakeven.
//
// ⚠ THIS UNLOCKS THE EASY AND MEDIUM BANKS, REVERSING A DELIBERATE V1 DECISION.
//
// V1's TIER_RECIPES never serve easy or medium at any stake. That floor exists because V1 pays from
// a HOUSE TREASURY: at low difficulty a competent player could grind a reliable positive expectation
// and drain it. The reasoning does not carry to V2, where payouts come from a player-funded pot with
// a rake — a strong player wins a larger share of a fixed pot rather than extracting from the house,
// so the pot is the ceiling no matter how well anyone plays.
//
// If any V2 mode ever pays from house funds, THE FLOOR MUST COME BACK. This comment is the only
// thing standing between that change and a drainable treasury.
//
// Spec: ARCADIA_V2_ECONOMY_SPEC.md §4.1. The modelled accuracy column there rests on four invented
// per-tier accuracies — measure them (GET /api/admin/v2/calibration) before trusting the drift.

/** [easy, medium, hard, extreme] counts summing to 15 — one round. */
export type Recipe = readonly [number, number, number, number];

export interface Band {
  /** Inclusive lower bound in basis points (10000 = 1.0x). */
  minBp: number;
  /** Exclusive upper bound in bp. */
  maxBp: number;
  label: string;
  recipe: Recipe;
}

export const BANDS: readonly Band[] = [
  { minBp:     1, maxBp:  5001, label: "recovery", recipe: [4, 7, 4, 0] },
  { minBp:  5001, maxBp:  9001, label: "climbing", recipe: [2, 7, 6, 0] },
  { minBp:  9001, maxBp: 12001, label: "baseline", recipe: [0, 6, 7, 2] },
  { minBp: 12001, maxBp: 16001, label: "ahead",    recipe: [0, 3, 8, 4] },
  { minBp: 16001, maxBp: 22001, label: "strong",   recipe: [0, 1, 7, 7] },
  { minBp: 22001, maxBp: Number.MAX_SAFE_INTEGER, label: "elite", recipe: [0, 0, 4, 11] },
] as const;

/**
 * The tier recipe for a multiplier. Busted players (0) get the recovery recipe — they are about to
 * rebuy at 1.0x, and serving them the hardest questions on re-entry would be perverse.
 */
export function bandFor(multiplierBp: number): Band {
  if (multiplierBp <= 0) return BANDS[0];
  for (const band of BANDS) {
    if (multiplierBp >= band.minBp && multiplierBp < band.maxBp) return band;
  }
  return BANDS[BANDS.length - 1];
}

/**
 * Expand a band's recipe into 15 tier slots (0=easy … 3=extreme), shuffled so the hard questions
 * do not always land in the same positions within a round.
 *
 * Deterministic in `seed` so a round can be rebuilt identically — required for the audit trail, and
 * it stops a player from re-rolling a round by reconnecting.
 */
export function tierSlots(multiplierBp: number, seed: number): number[] {
  const { recipe } = bandFor(multiplierBp);
  const slots: number[] = [];
  recipe.forEach((count, tier) => {
    for (let i = 0; i < count; i++) slots.push(tier);
  });

  // Fisher-Yates with mulberry32 — same generator as choiceGame.shuffle, whose low-bit LCG
  // predecessor placed the answer at index 3 ~99% of the time.
  let s = (seed || 1) >>> 0;
  for (let i = slots.length - 1; i > 0; i--) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(rand * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}
