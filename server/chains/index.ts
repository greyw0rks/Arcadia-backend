// Server-side funding gate — Celo only.

import type { CeloToken } from "../../lib/contract";
import * as celo from "./celo";

export type { OnchainSession } from "./celo";

export function isFundedByChain(
  sessionId: `0x${string}`,
  player: string,
  token?: CeloToken
): Promise<boolean> {
  return celo.isFundedBy(sessionId, player, token);
}

export function fetchOnchainSession(
  sessionId: `0x${string}`,
  player: string,
  token?: CeloToken
) {
  return celo.fetchSession(sessionId, player, token);
}
