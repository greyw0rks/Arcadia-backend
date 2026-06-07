import { NextRequest, NextResponse } from "next/server";
import { getSession, scoreAnswer } from "../../../server/sessions";

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

  const outcome = scoreAnswer(session, answerIndex);
  if (!outcome) {
    return NextResponse.json({ error: "no round in flight" }, { status: 409 });
  }

  return NextResponse.json(outcome);
}
