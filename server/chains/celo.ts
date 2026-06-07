// Celo (EVM) read-only chain access. Confirms a session was actually staked on-chain before we serve
// any rounds. Prevents playing (and getting a signed payout) without putting money down.

import { createPublicClient, http, getAddress } from "viem";
import { celoChain, ARCADE_ADDRESS, RPC_URL } from "../../lib/contract";
import { ARCADE_ABI } from "../../lib/abi";

const publicClient = createPublicClient({
  chain: celoChain,
  transport: http(RPC_URL),
});

const ZERO = "0x0000000000000000000000000000000000000000";

/** On-chain session facts the backend needs once funding is confirmed. */
export interface OnchainSession {
  effectiveStake: bigint; // post-rake base the multiplier applies to (drives bet-scaled difficulty)
  maxRounds: number; // round count the player committed to on-chain (authoritative)
}

/**
 * Returns the on-chain session iff it exists, belongs to `player`, and is not yet settled — else null.
 * Null doubles as the funding gate (no stake => null => no rounds served).
 */
export async function fetchSession(
  sessionId: `0x${string}`,
  player: string
): Promise<OnchainSession | null> {
  try {
    const s = await publicClient.readContract({
      address: ARCADE_ADDRESS,
      abi: ARCADE_ABI,
      functionName: "getSession",
      args: [sessionId],
    });
    if (s.player === ZERO) return null;
    if (s.settled) return null;
    if (getAddress(s.player) !== getAddress(player)) return null;
    return { effectiveStake: s.effectiveStake, maxRounds: Number(s.maxRounds) };
  } catch {
    return null;
  }
}

/** True iff the session exists on-chain, belongs to `player`, and is not yet settled. */
export async function isFundedBy(sessionId: `0x${string}`, player: string): Promise<boolean> {
  return (await fetchSession(sessionId, player)) !== null;
}
