// Base (OP Stack L2) read-only chain access. Mirrors celo.ts but targets the Base network.
// The QuizArcade contract on Base only accepts USDC, so there is no token routing dimension here.

import { createPublicClient, http, getAddress } from "viem";
import { baseChain, BASE_RPC_URL, BASE_TOKENS } from "../../lib/contract";
import { ARCADE_ABI } from "../../lib/abi";
import type { OnchainSession } from "./celo";

export type { OnchainSession };

const publicClient = createPublicClient({
  chain: baseChain,
  transport: http(BASE_RPC_URL),
});

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * Returns the on-chain session iff it exists, belongs to `player`, and is not yet settled — else null.
 * Null doubles as the funding gate (no stake => null => no rounds served).
 * Base only has one QuizArcade instance (USDC), so no token parameter is needed.
 */
export async function fetchSession(
  sessionId: `0x${string}`,
  player: string
): Promise<OnchainSession | null> {
  const arcade = BASE_TOKENS.usdc.arcadeAddress;
  // Skip the check if the contract isn't deployed yet (placeholder zero address).
  if (!arcade || arcade.toLowerCase() === ZERO) return null;
  try {
    const s = await publicClient.readContract({
      address: arcade,
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
export async function isFundedBy(
  sessionId: `0x${string}`,
  player: string
): Promise<boolean> {
  return (await fetchSession(sessionId, player)) !== null;
}
