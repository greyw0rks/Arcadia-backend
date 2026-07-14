// Server-side read-only funding gate. Confirms a session was actually staked on-chain before we
// serve any rounds. Per-chain logic lives in ./chains/celo.ts.

import type { Session } from "./sessions";
import { isFundedByChain, fetchOnchainSession, type OnchainSession } from "./chains";

/** True iff the session exists on-chain, belongs to the recorded player, and is not yet settled. */
export async function isFundedBy(session: Session): Promise<boolean> {
  return isFundedByChain(session.id, session.player, session.token);
}

/**
 * Fetch the authoritative on-chain session (effective stake + round count) for a pending session,
 * or null if it isn't funded on-chain yet. Used to derive bet-scaled difficulty from the REAL stake.
 */
export async function fetchOnchain(session: Session): Promise<OnchainSession | null> {
  return fetchOnchainSession(session.id, session.player, session.token);
}
