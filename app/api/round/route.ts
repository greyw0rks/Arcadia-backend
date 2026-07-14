import { NextRequest, NextResponse } from "next/server";
import { parseUnits } from "viem";
import { getGame } from "../../../server/games/registry";
import { getSession, nextRound } from "../../../server/sessions";
import { fetchOnchain } from "../../../server/chain";
import {
  MAX_STAKE,
  DEFAULT_RAKE_BPS,
  difficultyFractionBaseUnits,
  roundsFor,
} from "../../../server/difficulty";
import { celoTokenMeta } from "../../../lib/contract";

// GET /api/round?sessionId=0x..
// Verifies the session is funded on-chain (by the recorded player) before serving the next round.
// Returns the round view (no answer key) or { done: true } when the game is over.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }
  if (session.finalized) {
    return NextResponse.json({ error: "session already finalized" }, { status: 409 });
  }

  const game = getGame(session.gameId)!;

  // Demo sessions have no on-chain stake: skip the funding gate entirely. Their difficulty and round
  // count are fixed at creation (see /api/session). Real sessions must pass the gate below.
  if (!session.isDemo) {
    // On-chain funding gate: no stake, no questions. The read also yields the REAL staked amount and
    // round count, which we use as the authoritative source for bet-scaled difficulty.
    const onchain = await fetchOnchain(session);
    if (!onchain) {
      return NextResponse.json({ error: "session not funded on-chain yet" }, { status: 402 });
    }

    // Reconcile once, before the first round is built: derive difficulty from the on-chain stake and
    // trust the on-chain round count over any client-supplied value. Guarded so repeated polls and the
    // client's funding-gate retry loop never recompute or mutate mid-game.
    if (session.difficulty === undefined) {
      // Stake-token decimals: cUSD is 18-dec, USDC/USDT are 6-dec.
      const decimals = celoTokenMeta(session.token).decimals;
      const maxStakeBase = parseUnits(String(MAX_STAKE[session.chain]), decimals);
      session.difficulty = difficultyFractionBaseUnits(
        onchain.effectiveStake,
        maxStakeBase,
        DEFAULT_RAKE_BPS
      );
      if (onchain.maxRounds > 0) {
        session.maxRounds = Math.min(onchain.maxRounds, game.bankSize);
      }
    }
  }

  const view = nextRound(game, session);
  if (!view) {
    return NextResponse.json({ done: true, multiplierBp: session.multiplierBp });
  }

  return NextResponse.json({
    done: false,
    round: view,
    multiplierBp: session.multiplierBp,
  });
}
