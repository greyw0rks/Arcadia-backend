// server/v2/merkle.ts — the tree ArcadiaPool.claim() verifies against.
//
// Must match the contract EXACTLY. A mismatch is not a soft failure: the root is published on-chain
// and is authoritative, so every proof the backend generates would be rejected and the whole week's
// payouts would be unclaimable until the claim window expires. The two rules to hold:
//
//   leaf   = keccak256(abi.encode(uint256 weekId, address player, uint256 amount))
//   parent = keccak256(sorted(left, right))
//
// OpenZeppelin's MerkleProof sorts each pair before hashing, which makes proofs
// position-independent — no left/right flags to get wrong. `ArcadiaPool.leafFor()` exposes the leaf
// hash on-chain specifically so this can be checked against the contract rather than assumed.

import { encodeAbiParameters, keccak256, type Hex } from "viem";

export interface PayoutEntry {
  player: `0x${string}`;
  /** Token's smallest unit. bigint because 18-decimal amounts exceed Number.MAX_SAFE_INTEGER. */
  amount: bigint;
}

export interface MerkleTree {
  root: Hex;
  /** player (lowercased) → proof */
  proofs: Map<string, Hex[]>;
  leaves: Hex[];
  totalPayout: bigint;
}

/** keccak256(abi.encode(weekId, player, amount)) — mirrors ArcadiaPool.leafFor(). */
export function leafFor(weekId: bigint, player: `0x${string}`, amount: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
      [weekId, player, amount]
    )
  );
}

/** Sorted-pair hash, matching OpenZeppelin MerkleProof. */
function hashPair(a: Hex, b: Hex): Hex {
  const [lo, hi] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(`0x${lo.slice(2)}${hi.slice(2)}` as Hex);
}

/**
 * Build the week's tree.
 *
 * Entries are sorted by player address so the same inputs always produce the same root, regardless
 * of the order rows came back from the database. Without that, a re-run during an incident could
 * produce a different root for identical data and look like tampering.
 *
 * Odd nodes are promoted unchanged rather than duplicated. Duplicating a node is the classic merkle
 * forgery vector — with duplication, an internal node can be replayed as a leaf.
 */
export function buildTree(weekId: bigint, entries: PayoutEntry[]): MerkleTree {
  if (entries.length === 0) {
    throw new Error("cannot build a merkle tree with no payouts");
  }

  const sorted = [...entries].sort((a, b) =>
    a.player.toLowerCase() < b.player.toLowerCase() ? -1 : a.player.toLowerCase() > b.player.toLowerCase() ? 1 : 0
  );

  const seen = new Set<string>();
  for (const e of sorted) {
    const key = e.player.toLowerCase();
    // Two leaves for one player would let them claim twice — except hasClaimed blocks the second,
    // so the real effect is a silently unpayable allocation. Either way it is a bug, not a case to
    // handle gracefully.
    if (seen.has(key)) throw new Error(`duplicate payout entry for ${e.player}`);
    if (e.amount <= 0n) throw new Error(`non-positive payout for ${e.player}`);
    seen.add(key);
  }

  const leaves = sorted.map((e) => leafFor(weekId, e.player, e.amount));

  // Track each leaf's position as the tree is built so proofs can be read off directly.
  let level: Hex[] = leaves;
  const layers: Hex[][] = [level];
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i]);
    }
    layers.push(next);
    level = next;
  }

  const proofs = new Map<string, Hex[]>();
  sorted.forEach((entry, leafIndex) => {
    const proof: Hex[] = [];
    let index = leafIndex;
    for (let depth = 0; depth < layers.length - 1; depth++) {
      const layer = layers[depth];
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      // No sibling means this node was promoted unchanged — nothing to add to the proof.
      if (siblingIndex < layer.length) proof.push(layer[siblingIndex]);
      index = Math.floor(index / 2);
    }
    proofs.set(entry.player.toLowerCase(), proof);
  });

  return {
    root: layers[layers.length - 1][0],
    proofs,
    leaves,
    totalPayout: sorted.reduce((sum, e) => sum + e.amount, 0n),
  };
}

/** Verify a proof locally. Used to self-check every proof before a root is published. */
export function verifyProof(root: Hex, leaf: Hex, proof: Hex[]): boolean {
  let computed = leaf;
  for (const sibling of proof) computed = hashPair(computed, sibling);
  return computed.toLowerCase() === root.toLowerCase();
}
