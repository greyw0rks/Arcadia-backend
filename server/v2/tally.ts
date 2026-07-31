// server/v2/tally.ts — turn a week of play into the payout amounts the merkle root commits to.
//
// This is the only place that decides how much real money each player receives, so it is written to
// be auditable rather than clever. Two rules govern everything:
//
//   1. THE POT IS THE CEILING. sum(payouts) must never exceed the pot. ArcadiaPool enforces this
//      on-chain too, but a root that over-allocates would be rejected at publish time and strand
//      the week — so the arithmetic has to be right here, not merely caught there.
//
//   2. NO FLOAT. Every amount is a bigint in the token's smallest unit. Shares are computed with
//      integer division, and the rounding dust is handled explicitly rather than left to drift.

export interface RunTally {
  player: string;
  /** Best multiplier across the player's runs that week, in bp. Busted runs contribute 0. */
  bestBp: number;
}

export interface PayoutShare {
  player: string;
  bestBp: number;
  amount: bigint;
}

export interface TallyResult {
  shares: PayoutShare[];
  totalPayout: bigint;
  /** Pot left unallocated: integer-division dust, plus the whole pot if nobody survived. */
  remainder: bigint;
}

/**
 * Split `pot` across players in proportion to their final multiplier.
 *
 * Proportional rather than winner-take-all because §4.2's payout spread (~4.5× p10→p99) is what
 * makes a pooled split meaningful — a player who finished at 2.0x should receive roughly twice what
 * a player at 1.0x does.
 *
 * Busted players (bestBp <= 0) receive nothing. Their entry stays in the pot and is redistributed,
 * which is the design in spec §6: forfeited stake goes to the pool, never to the platform.
 */
export function tallyWeek(pot: bigint, runs: RunTally[]): TallyResult {
  const survivors = runs.filter((r) => r.bestBp > 0);

  // Nobody survived. Every payout is zero and the whole pot rolls forward via sweepWeek().
  // Returning an empty share list is correct — publishing a root with no leaves is not possible,
  // so the caller must skip publication and let the roll-forward handle it.
  if (survivors.length === 0) {
    return { shares: [], totalPayout: 0n, remainder: pot };
  }

  const totalBp = survivors.reduce((sum, r) => sum + BigInt(r.bestBp), 0n);

  const shares: PayoutShare[] = survivors.map((r) => ({
    player: r.player,
    bestBp: r.bestBp,
    // Integer division truncates, so every share is <= its exact value and the sum can only be
    // under the pot, never over. That direction matters: over-allocating would fail on-chain.
    amount: (pot * BigInt(r.bestBp)) / totalBp,
  }));

  const allocated = shares.reduce((sum, s) => sum + s.amount, 0n);

  // Drop zero-value shares — a leaf paying nothing costs the claimant gas to claim nothing, and
  // ArcadiaPool rejects non-positive amounts anyway. Dropping them does not change `allocated`,
  // since the amounts being dropped are zero.
  const paying = shares.filter((s) => s.amount > 0n);

  return {
    shares: paying,
    totalPayout: allocated,
    // Truncation dust only. Left in the pot; sweepWeek() rolls it into the next week.
    remainder: pot - allocated,
  };
}

/**
 * The multiplier a player is credited with for the week: their best run.
 *
 * Best rather than last, because a rebuy resets to 1.0x — crediting the last run would mean a
 * player who reached 3.0x, busted, and rebought on Sunday evening scores 1.0x, which punishes
 * exactly the behaviour the rebuy mechanic is meant to encourage.
 *
 * Busted runs score 0 regardless of how high they climbed before busting. Bust is a real loss or
 * the mechanic has no teeth.
 */
export function bestMultiplierBp(runs: Array<{ multiplierBp: number; busted: boolean }>): number {
  let best = 0;
  for (const run of runs) {
    if (run.busted) continue;
    if (run.multiplierBp > best) best = run.multiplierBp;
  }
  return best;
}
