import { NextRequest, NextResponse } from "next/server";
import { getSession, scoreAnswer } from "../../../server/sessions";
import { FAST_ANSWER_FLOOR_MS, enforcementOn } from "../../../server/anticheat";

// POST /api/answer  { sessionId: "0x..", answerIndex: number }
// Scores the in-flight round SERVER-SIDE (correct answer never left the server) and updates the
// running multiplier. Late answers / timeouts are scored wrong by the session manager.
export async function POST(req: NextRequest) {
  let body: { sessionId?: string; answerIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { sessionId, answerIndex } = body;
  if (!sessionId || typeof answerIndex !== "number") {
    return NextResponse.json({ error: "sessionId and answerIndex required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }
  if (session.finalized) {
    return NextResponse.json({ error: "session already finalized" }, { status: 409 });
  }

  // Anti-automation: an answer arriving faster than a human can read four options is not a human.
  // We compute the elapsed time against the round's server-stamped servedAt. When enforcement is on
  // we reject it (no score change, so a bot can't burn the round); when off we let it through and
  // let the finalize-time classifier flag the session instead.
  const round = session.current;
  if (round && round.servedAt > 0) {
    const elapsed = Date.now() - round.servedAt;
    if (elapsed >= 0 && elapsed < FAST_ANSWER_FLOOR_MS && enforcementOn()) {
      return NextResponse.json(
        { error: "answer received too fast", tooFast: true },
        { status: 429 }
      );
    }
  }

  const outcome = scoreAnswer(session, answerIndex);
  if (!outcome) {
    return NextResponse.json({ error: "no round in flight" }, { status: 409 });
  }

  return NextResponse.json(outcome);
}
