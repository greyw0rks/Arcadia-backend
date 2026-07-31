import { NextRequest, NextResponse } from "next/server";
import { requireTester } from "../../_gate";
import { ensureBooted } from "../../../../../server/bootstrap";
import { liveRun, recordRound, roundsToday } from "../../../../../server/v2/runs";
import { bandFor, tierSlots } from "../../../../../server/v2/bands";
import { QUESTIONS_PER_ROUND, passMark } from "../../../../../server/v2/scoring";
import { V2DatabaseError } from "../../../../../server/v2/db";
import { currentWeekId, todayKey } from "../../../../../server/v2/week";

export const dynamic = "force-dynamic";

// POST /api/v2/run/round  { correct, sessionId? }
//
// Banks one completed round against the caller's live run. `correct` is the number of questions
// answered correctly out of 15; the pass mark turns that into a ±0.10x move (spec §4.2).
//
// ⚠ TRUST NOTE: `correct` is currently supplied by the client. That is acceptable only because V2
// is invite-only on a staging deploy with a testnet token — a tester could otherwise claim 15/15
// every round. The real flow must score rounds server-side from the existing session store
// (server/sessions.ts already holds the answer keys and never sends them to the client), and this
// route should take a sessionId and read the outcome rather than being told it. Tracked as the
// integration step in V2_OPEN_WORK #3.

export async function POST(req: NextRequest) {
  const gate = requireTester(req);
  if (gate instanceof NextResponse) return gate;
  const { player, chain } = gate;

  let body: { correct?: number; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const correct = Number(body.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > QUESTIONS_PER_ROUND) {
    return NextResponse.json(
      { error: `correct must be an integer between 0 and ${QUESTIONS_PER_ROUND}` },
      { status: 400 }
    );
  }

  try {
    await ensureBooted();
    const weekId = currentWeekId();
    const run = await liveRun(weekId, player, chain);
    if (!run) {
      return NextResponse.json(
        { error: "no live run — enter this week first" },
        { status: 409 }
      );
    }

    const day = todayKey();
    // The day index is derived server-side from what has already been banked, never taken from the
    // client. Otherwise a player could replay index 0 forever and never exhaust the free allowance,
    // or skip ahead to make free rounds look purchased (which are upside-only).
    const dayIndex = await roundsToday(run.id, day);

    const result = await recordRound(run, {
      day,
      dayIndex,
      correct,
      sessionId: body.sessionId,
    });

    return NextResponse.json({
      weekId,
      passed: result.passed,
      deltaBp: result.deltaBp,
      multiplierBp: result.multiplierBp,
      band: result.band,
      busted: result.busted,
      purchased: result.purchased,
      freeRoundsLeft: result.freeRoundsLeft,
      passMark: passMark(),
      // What the next round will look like, so the client can render difficulty without a round-trip.
      nextRound: result.busted
        ? null
        : { band: bandFor(result.multiplierBp).label, tiers: tierSlots(result.multiplierBp, Number(run.id) + dayIndex + 1) },
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
