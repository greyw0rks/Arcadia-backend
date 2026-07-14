// Celo (EVM) read-only chain access. Confirms a session was actually staked on-chain before we
// serve any rounds. Prevents playing (and getting a signed payout) without putting money down.
//
// v2: QuizArcade is a single multi-token contract (ARCADE_ADDRESS). getSession returns a 7-field
// tuple including `token` at index 1. We verify the on-chain token matches the session's expected
// token to prevent cross-token session reuse (belt-and-suspenders on top of EIP-712).

import { createPublicClient, http, getAddress } from "viem";
import { celoChain, RPC_URL, ARCADE_ADDRESS, celoTokenMeta, type CeloToken } from "../../lib/contract";
import { ARCADE_ABI } from "../../lib/abi";

const publicClient = createPublicClient({
  chain: celoChain,
  transport: http(RPC_URL),
});

const ZERO = "0x0000000000000000000000000000000000000000";

/** On-chain session facts the backend needs once funding is confirmed. */
export interface OnchainSession {
  effectiveStake: bigint; // post-rake base the multiplier applies to (drives bet-scaled difficulty)
  maxRounds: number;      // round count the player committed to on-chain (authoritative)
}

/**
 * Returns the on-chain session iff it exists, belongs to `player`, uses the expected `token`,
 * and is not yet settled — else null. Null doubles as the funding gate (no stake => no rounds).
 */
export async function fetchSession(
  sessionId: `0x${string}`,
  player: string,
  token?: CeloToken
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
    // Verify on-chain token matches what the backend session record expects.
    if (token) {
      const expectedToken = celoTokenMeta(token).tokenAddress;
      if (getAddress(s.token) !== getAddress(expectedToken)) return null;
    }
    return { effectiveStake: s.effectiveStake, maxRounds: Number(s.maxRounds) };
  } catch {
    return null;
  }
}

/** True iff the session exists on-chain, belongs to `player`, and is not yet settled. */
export async function isFundedBy(
  sessionId: `0x${string}`,
  player: string,
  token?: CeloToken
): Promise<boolean> {
  return (await fetchSession(sessionId, player, token)) !== null;
}
