import { NextRequest, NextResponse } from "next/server";
import { getSession, finalMultiplierBp } from "../../../server/sessions";
import { signSettlement } from "../../../server/signer";

// POST /api/finalize  { sessionId: "0x.." }
// Computes the final (clamped) multiplier and returns an EIP-712 signature the client submits to
// settle(sessionId, multiplierBp, signature). Idempotent: returns the same signature if called again.
export async function POST(req: NextRequest) {
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
  const signature = await signSettlement(session.chain, session.id, multiplierBp, session.token);
  session.finalized = true;

  return NextResponse.json({ sessionId: session.id, multiplierBp, signature });
}
