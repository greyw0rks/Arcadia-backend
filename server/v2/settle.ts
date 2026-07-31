// server/v2/settle.ts — the weekend tally.
//
// Turns a completed week into a signed merkle root the operator publishes to ArcadiaPool. This is
// the moment play becomes money, so it is written to fail loudly rather than approximately:
//
//   - every read goes through mustQuery (throws), never query() (returns null). A dropped
//     connection mid-tally must abort, not silently omit a player who is owed a payout.
//   - every generated proof is verified locally BEFORE the root is signed. A root is authoritative
//     once on-chain; discovering a bad proof afterwards means a week of unclaimable payouts.
//   - the result is idempotent. Re-running a settled week returns the stored root rather than
//     recomputing, so an operator retry cannot produce a second, different root.

import { mustQuery, mustQueryMaybe } from "./db";
import { runsForWeek } from "./runs";
import { tallyWeek, bestMultiplierBp, type RunTally } from "./tally";
import { buildTree, verifyProof, leafFor } from "./merkle";
import { isWeekComplete } from "./week";
import type { Hex } from "viem";

export interface SettlementResult {
  weekId: number;
  root: Hex;
  totalPayout: bigint;
  pot: bigint;
  players: number;
  /** player (lowercased) → { amount, proof } — what each tester needs to claim. */
  claims: Map<string, { amount: bigint; proof: Hex[] }>;
  alreadySettled: boolean;
}

/**
 * Compute (or fetch) the settlement for a week.
 *
 * `pot` is passed in rather than read from chain here so this stays a pure-ish function the
 * operator can dry-run against a hypothetical pot before committing.
 */
export async function settleWeek(
  weekId: number,
  chain: string,
  pot: bigint,
  opts?: { now?: Date }
): Promise<SettlementResult> {
  // Settling a live week would freeze multipliers that can still move.
  if (!isWeekComplete(weekId, opts?.now ?? new Date())) {
    throw new Error(`week ${weekId} is not over yet — refusing to settle`);
  }

  // Idempotency: an operator retry must never mint a second root for the same week.
  const existing = await mustQueryMaybe<Record<string, unknown>>(
    `SELECT root, total_payout, pot, players FROM weekly_settlements WHERE week_id = $1`,
    [weekId]
  );
  if (existing) {
    const stored = await mustQuery<Record<string, unknown>>(
      `SELECT player, amount FROM weekly_payouts WHERE week_id = $1 AND chain = $2`,
      [weekId, chain]
    );
    const entries = stored.rows.map((r) => ({
      player: String(r.player) as `0x${string}`,
      amount: BigInt(String(r.amount)),
    }));
    const tree = buildTree(BigInt(weekId), entries);
    const claims = new Map<string, { amount: bigint; proof: Hex[] }>();
    for (const e of entries) {
      claims.set(e.player.toLowerCase(), {
        amount: e.amount,
        proof: tree.proofs.get(e.player.toLowerCase())!,
      });
    }
    return {
      weekId,
      root: String(existing.root) as Hex,
      totalPayout: BigInt(String(existing.total_payout)),
      pot: BigInt(String(existing.pot)),
      players: Number(existing.players),
      claims,
      alreadySettled: true,
    };
  }

  // Best run per player. Busted runs score 0 — bust is a real loss (spec §6).
  const runs = await runsForWeek(weekId, chain);
  const byPlayer = new Map<string, Array<{ multiplierBp: number; busted: boolean }>>();
  for (const r of runs) {
    const key = r.player.toLowerCase();
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key)!.push({ multiplierBp: r.multiplierBp, busted: r.busted });
  }

  const tallies: RunTally[] = [...byPlayer.entries()].map(([player, rs]) => ({
    player,
    bestBp: bestMultiplierBp(rs),
  }));

  const { shares, totalPayout, remainder } = tallyWeek(pot, tallies);

  // Nobody survived, or the pot is too small to split. There is nothing to publish — the whole pot
  // rolls into next week via ArcadiaPool.sweepWeek(). Publishing an empty root is impossible
  // (buildTree rejects it) and would be meaningless anyway.
  if (shares.length === 0) {
    throw new Error(
      `week ${weekId}: no payable shares (pot ${pot}, ${tallies.length} players) — let it roll forward instead`
    );
  }

  const entries = shares.map((s) => ({
    player: s.player as `0x${string}`,
    amount: s.amount,
  }));
  const tree = buildTree(BigInt(weekId), entries);

  // Self-check every proof before the root is signed. Once published the root is authoritative and
  // a bad proof means the payout cannot be claimed at all.
  for (const e of entries) {
    const proof = tree.proofs.get(e.player.toLowerCase());
    if (!proof || !verifyProof(tree.root, leafFor(BigInt(weekId), e.player, e.amount), proof)) {
      throw new Error(`week ${weekId}: generated proof failed verification for ${e.player}`);
    }
  }

  // Belt and braces: the contract rejects an over-allocated root, but catching it here means a
  // clear error instead of a failed transaction.
  if (tree.totalPayout > pot) {
    throw new Error(`week ${weekId}: allocated ${tree.totalPayout} exceeds pot ${pot}`);
  }

  // Persist so the published root can be re-derived and audited later.
  for (const s of shares) {
    await mustQuery(
      `INSERT INTO weekly_payouts (week_id, player, chain, best_bp, amount, leaf)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (week_id, player, chain) DO NOTHING`,
      [
        weekId,
        s.player.toLowerCase(),
        chain,
        s.bestBp,
        s.amount.toString(),
        leafFor(BigInt(weekId), s.player as `0x${string}`, s.amount),
      ]
    );
  }

  await mustQuery(
    `INSERT INTO weekly_settlements (week_id, chain, root, total_payout, pot, players)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (week_id) DO NOTHING`,
    [weekId, chain, tree.root, totalPayout.toString(), pot.toString(), shares.length]
  );

  console.log(
    `[v2/settle] week ${weekId}: ${shares.length} players, ${totalPayout} of ${pot} allocated, ${remainder} dust`
  );

  const claims = new Map<string, { amount: bigint; proof: Hex[] }>();
  for (const e of entries) {
    claims.set(e.player.toLowerCase(), {
      amount: e.amount,
      proof: tree.proofs.get(e.player.toLowerCase())!,
    });
  }

  return {
    weekId,
    root: tree.root,
    totalPayout,
    pot,
    players: shares.length,
    claims,
    alreadySettled: false,
  };
}
