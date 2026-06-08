// Stacks (Clarity) read-only chain access. Mirrors celo.ts: confirm the session was staked on-chain
// (native STX) by the recorded player before serving rounds. Reads the `get-session` read-only fn
// over the Hiro API.

import {
  callReadOnlyFunction,
  cvToJSON,
  bufferCV,
  ClarityType,
} from "@stacks/transactions";
import {
  STACKS_ARCADE_CONTRACT,
  stacksNetwork,
  STACKS_API_URL,
} from "../../lib/contract";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** On-chain session facts the backend needs once funding is confirmed. */
export interface OnchainSession {
  effectiveStake: bigint; // micro-STX post-rake base the multiplier applies to (drives difficulty)
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
    const [contractAddress, contractName] = STACKS_ARCADE_CONTRACT.split(".");
    const result = await callReadOnlyFunction({
      contractAddress,
      contractName,
      functionName: "get-session",
      functionArgs: [bufferCV(hexToBytes(sessionId))],
      network: await stacksNetwork(),
      senderAddress: contractAddress,
    });

    // get-session returns (optional { player, ..., settled }). none => not funded.
    if (result.type === ClarityType.OptionalNone) return null;

    const json = cvToJSON(result);
    const session = json.value?.value; // some -> tuple -> fields
    if (!session) return null;

    const onChainPlayer: string | undefined = session.player?.value;
    const settled: boolean = session.settled?.value === true;
    if (settled) return null;
    if (!onChainPlayer || onChainPlayer !== player) return null;

    // Clarity uints serialize as decimal strings via cvToJSON.
    return {
      effectiveStake: BigInt(session["effective-stake"]?.value ?? "0"),
      maxRounds: Number(session["max-rounds"]?.value ?? "0"),
    };
  } catch {
    return null;
  }
}

/** True iff the session exists on-chain, belongs to `player`, and is not yet settled. */
export async function isFundedBy(sessionId: `0x${string}`, player: string): Promise<boolean> {
  return (await fetchSession(sessionId, player)) !== null;
}
