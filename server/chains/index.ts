// Chain dispatch for the server-side funding gate. Each adapter exposes `isFundedBy`.

import type { ChainId, CeloToken } from "../../lib/contract";
import * as celo from "./celo";
import * as base from "./base";
import * as stacks from "./stacks";

export type { OnchainSession } from "./celo";

export async function isFundedByChain(
  chain: ChainId,
  sessionId: `0x${string}`,
  player: string,
  token?: CeloToken
): Promise<boolean> {
  switch (chain) {
    case "stacks":
      return stacks.isFundedBy(sessionId, player);
    case "base":
      return base.isFundedBy(sessionId, player);
    case "celo":
    default:
      return celo.isFundedBy(sessionId, player, token);
  }
}

/** Fetch the on-chain session (stake + round count) or null if not funded/owned/settled. */
export async function fetchOnchainSession(
  chain: ChainId,
  sessionId: `0x${string}`,
  player: string,
  token?: CeloToken
) {
  switch (chain) {
    case "stacks":
      return stacks.fetchSession(sessionId, player);
    case "base":
      return base.fetchSession(sessionId, player);
    case "celo":
    default:
      return celo.fetchSession(sessionId, player, token);
  }
}
