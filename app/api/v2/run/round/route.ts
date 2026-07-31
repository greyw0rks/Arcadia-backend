import { NextRequest, NextResponse } from "next/server";
import { requireTester } from "../../_gate";
import { ensureBooted } from "../../../../../server/bootstrap";
import { liveRun, recordRound, roundsToday } from "../../../../../server/v2/runs";
import { bandFor, tierSlots } from "../../../../../server/v2/bands";
import { QUESTIONS_PER_ROUND, passMark } from "../../../../../server/v2/scoring";
import { V2DatabaseError } from "../../../../../server/v2/db";
import { currentWeekId, todayKey } from "../../../../../server/v2/week";
import { getSession, correctCount, isComplete } from "../../../../../server/sessions";

export const dynamic = "force-dynamic";

// POST /api/v2/run/round  { sessionId }
//
// Banks one completed round against the caller's live run.
//
// The score is READ FROM THE SERVER'S OWN SESSION STATE, never from the request body. The session
// store holds the answer keys and scores each answer as it arrives (server/sessions.ts scoreAnswer);
// this route only asks it how many were right. An earlier revision accepted a client-supplied
// `correct` count, which let a tester claim 15/15 every round — that would corrupt both the payouts
// and the per-tier calibration data the entire beta exists to gather.

export async function POST(req: NextRequest) {
  const gate = requireTester(req);
  if (gate instanceof NextResponse) return gate;
  const { player, chain } = gate;

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(body.sessionId);
  if (!session) {
    return NextResponse.json({ error: "unknown session" }, { status: 404 });
  }

  // The session must belong to the wallet the pass proves. Without this a tester could bank
  // somebody else's good session against their own run.
  if (session.player.toLowerCase() !== player.toLowerCase()) {
    return NextResponse.json({ error: "session does not belong to this wallet" }, { status: 403 });
  }

  // Banking a half-played session would let a player abandon bad rounds and only submit good ones.
  if (!isComplete(session)) {
    return NextResponse.json(
      { error: `round not finished (${session.answered}/${session.maxRounds})` },
      { status: 409 }
    );
  }

  // A V2 round is a fixed 15 questions. A session with a different round count is not a valid V2
  // round — accepting one would let a player bank a 3-question session as a full round.
  if (session.maxRounds !== QUESTIONS_PER_ROUND) {
    return NextResponse.json(
      { error: `not a V2 round: expected ${QUESTIONS_PER_ROUND} questions, got ${session.maxRounds}` },
      { status: 400 }
    );
  }

  const correct = correctCount(session);

  try {
    await ensureBooted();
    const weekId = currentWeekId();
    const run = await liveRun(weekId, player, chain);
    if (!run) {
      return NextResponse.json({ error: "no live run — enter this week first" }, { status: 409 });
    }

    const day = todayKey();
    // Derived server-side from what is already banked, never taken from the client. Otherwise a
    // player could replay index 0 forever and never exhaust the free allowance, or skip ahead to
    // make free rounds look purchased — purchased rounds are upside-only.
    const dayIndex = await roundsToday(run.id, day);

    const result = await recordRound(run, { day, dayIndex, correct, sessionId: session.id });

    return NextResponse.json({
      weekId,
      correct,
      questionsPerRound: QUESTIONS_PER_ROUND,
      passed: result.passed,
      deltaBp: result.deltaBp,
      multiplierBp: result.multiplierBp,
      band: result.band,
      busted: result.busted,
      purchased: result.purchased,
      freeRoundsLeft: result.freeRoundsLeft,
      passMark: passMark(),
      // True when this session had already been banked. The client should treat it as a no-op
      // rather than as a fresh gain.
      replayed: result.replayed ?? false,
      nextRound: result.busted
        ? null
        : {
            band: bandFor(result.multiplierBp).label,
            tiers: tierSlots(result.multiplierBp, Number(run.id) + dayIndex + 1),
          },
    });
  } catch (err) {
    if (err instanceof V2DatabaseError) {
      console.error("[v2/run/round]", err.message);
      return NextResponse.json({ error: "service temporarily unavailable" }, { status: 503 });
    }
    console.error("[v2/run/round] unexpected:", err);
    return NextResponse.json({ error: "unexpected error" }, { status: 500 });
  }
}
