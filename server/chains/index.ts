// Chain dispatch for the server-side funding gate. Each adapter exposes `isFundedBy`.

import type { ChainId } from "../../lib/contract";
import * as celo from "./celo";
import * as stacks from "./stacks";

export type { OnchainSession } from "./celo";

export async function isFundedByChain(
  chain: ChainId,
  sessionId: `0x${string}`,
  player: string
): Promise<boolean> {
  switch (chain) {
    case "stacks":
      return stacks.isFundedBy(sessionId, player);
    case "celo":
    default:
      return celo.isFundedBy(sessionId, player);
  }
}

/** Fetch the on-chain session (stake + round count) or null if not funded/owned/settled. */
export async function fetchOnchainSession(
  chain: ChainId,
  sessionId: `0x${string}`,
  player: string
) {
  switch (chain) {
    case "stacks":
      return stacks.fetchSession(sessionId, player);
    case "celo":
    default:
      return celo.fetchSession(sessionId, player);
  }
}
