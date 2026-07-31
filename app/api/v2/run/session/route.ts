import { NextRequest, NextResponse } from "next/server";
import { requireTester } from "../../_gate";
import { ensureBooted } from "../../../../../server/bootstrap";
import { getGame, listGameMeta } from "../../../../../server/games/registry";
import { createSession } from "../../../../../server/sessions";
import { liveRun } from "../../../../../server/v2/runs";
import { bandFor, BANDS, tierSlots } from "../../../../../server/v2/bands";
import { QUESTIONS_PER_ROUND } from "../../../../../server/v2/scoring";
import { V2DatabaseError } from "../../../../../server/v2/db";
import { currentWeekId } from "../../../../../server/v2/week";

export const dynamic = "force-dynamic";

// Seed the tier shuffle from the run and its current multiplier, so consecutive rounds in the same
// run do not repeat one fixed ordering of hard questions.
function seedFrom(runId: string, multiplierBp: number): number {
  let h = multiplierBp | 0;
  for (let i = 0; i < runId.length; i++) h = (h * 31 + runId.charCodeAt(i)) & 0x7fffffff;
  return h || 1;
}

// POST /api/v2/run/session  { game? }
//
// Opens a 15-question session belonging to the caller's live weekly run. The V1 /api/session route
// cannot serve this: it gates on a PER-SESSION on-chain stake, whereas a V2 round is paid for by
// the weekly entry. Difficulty also comes from the run's multiplier (§4.1) rather than from a bet.
//
// The session is flagged `weeklyRun` so the V1 funding gate in /api/round is skipped — there is no
// per-session stake to verify. It is deliberately NOT flagged `isDemo`, even though demos skip the
// same gate: the calibration report excludes demo answers, and V2 rounds are exactly the data the
// beta exists to gather.

export async function POST(req: NextRequest) {
  const gate = requireTester(req);
  if (gate instanceof NextResponse) return gate;
  const { player, chain } = gate;

  let body: { game?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    await ensureBooted();
    const weekId = currentWeekId();
    const run = await liveRun(weekId, player, chain);
    if (!run) {
      return NextResponse.json({ error: "no live run — start your week first" }, { status: 409 });
    }

    // Pick a game. A V2 round draws across formats; until round composition is built, honour an
    // explicit choice and otherwise pick any available game.
    const available = listGameMeta().filter((m) => m.available && m.bankSize >= QUESTIONS_PER_ROUND);
    if (available.length === 0) {
      return NextResponse.json({ error: "no game has enough questions for a round" }, { status: 503 });
    }
    const chosen = body.game
      ? available.find((m) => m.id === body.game)
      : available[Math.floor(Math.random() * available.length)];
    if (!chosen) {
      return NextResponse.json({ error: "unknown or unavailable game" }, { status: 404 });
    }
    const game = getGame(chosen.id)!;

    // Difficulty is a function of the run's multiplier, not of a stake. The §4.1 recipe is passed
    // through directly as a tier schedule — collapsing the band to a 0..1 `difficulty` does not
    // work, because V1's TIER_RECIPES never serve easy or medium at ANY difficulty (a deliberate
    // house-treasury floor, see bands.ts). Through that path the recovery band's [4,7,4,0] came out
    // as [0,0,11,4] — the hardest questions for the players closest to bust.
    //
    // `difficulty` is still set, since it drives the timer (scaleTimer) and is recorded on every
    // calibration sample. It is not what picks the tiers.
    const band = bandFor(run.multiplierBp);
    const bandIndex = BANDS.findIndex((b) => b.label === band.label);
    const difficulty = bandIndex / (BANDS.length - 1);
    const schedule = tierSlots(run.multiplierBp, seedFrom(run.id, run.multiplierBp));

    const session = createSession(game, player, QUESTIONS_PER_ROUND, chain as "celo", undefined, {
      // Skips the per-session on-chain funding gate — the weekly entry already paid for this.
      // Deliberately NOT isDemo: demo answers are excluded from the calibration sample
      // (`WHERE NOT is_demo`), and V2 rounds are precisely the data the beta exists to gather.
      weeklyRun: true,
      difficulty,
      tierSchedule: schedule,
    });

    return NextResponse.json({
      sessionId: session.id,
      game: { id: game.id, title: game.title, thumbnail: game.thumbnail },
      totalRounds: QUESTIONS_PER_ROUND,
      weekId,
      multiplierBp: run.multiplierBp,
      band: band.label,
    });
  } catch (err) {
    if (err instanceof V2DatabaseError) {
      console.error("[v2/run/session]", err.message);
      return NextResponse.json({ error: "service temporarily unavailable" }, { status: 503 });
    }
    console.error("[v2/run/session] unexpected:", err);
    return NextResponse.json({ error: "unexpected error" }, { status: 500 });
  }
}
