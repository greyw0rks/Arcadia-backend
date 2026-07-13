import { NextRequest, NextResponse } from "next/server";
import { getSession, finalMultiplierBp } from "../../../server/sessions";
import { signSettlement } from "../../../server/signer";
import { recordCompletedGame } from "../../../server/gameHistory";
import { DEFAULT_RAKE_BPS, BPS } from "../../../server/difficulty";
import { celoTokenMeta } from "../../../lib/contract";
import { ensureBooted } from "../../../server/bootstrap";

// POST /api/finalize  { sessionId: "0x.." }
// Computes the final (clamped) multiplier and returns an EIP-712 signature the client submits to
// settle(sessionId, multiplierBp, signature). Idempotent: returns the same signature if called again.
export async function POST(req: NextRequest) {
  await ensureBooted();
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }

  // Demo sessions never settle on-chain — there's no stake to pay out. The client ends the game
  // locally instead of calling this route, but reject defensively in case it does.
  if (session.isDemo) {
    return NextResponse.json({ error: "demo sessions are not settled" }, { status: 400 });
  }

  // Require all rounds answered before signing a payout.
  if (session.answered < session.maxRounds) {
    return NextResponse.json(
      { error: `game not complete (${session.answered}/${session.maxRounds})` },
      { status: 409 }
    );
  }

  const multiplierBp = finalMultiplierBp(session);
  const signature = await signSettlement(session.id, multiplierBp, session.token);
  session.finalized = true;

  // Record immediately so profile stats are visible before the on-chain event is indexed.
  if (session.stake != null) {
    const stake = session.stake;
    const effectiveStake = stake * (BPS - DEFAULT_RAKE_BPS) / BPS;
    recordCompletedGame({
      sessionId: session.id,
      player: session.player,
      chain: session.chain,
      unit: celoTokenMeta(session.token).symbol,
      stake,
      multiplierBp,
      payout: Math.round((effectiveStake * multiplierBp) / 100) / 100,
      won: multiplierBp > 10_000,
      difficulty: session.difficulty ?? Math.min(1, stake),
      approxTs: Date.now(),
    });
  }

  return NextResponse.json({ sessionId: session.id, multiplierBp, signature });
}
