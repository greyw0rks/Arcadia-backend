import { NextRequest, NextResponse } from "next/server";
import { requireTester } from "../_gate";
import { ensureBooted } from "../../../../server/bootstrap";
import { liveRun, openRun, roundsToday } from "../../../../server/v2/runs";
import { bandFor } from "../../../../server/v2/bands";
import { FREE_ROUNDS_PER_DAY, passMark, QUESTIONS_PER_ROUND } from "../../../../server/v2/scoring";
import { V2DatabaseError, mustQuery } from "../../../../server/v2/db";
import { currentWeekId, todayKey } from "../../../../server/v2/week";
import { checkPaidEntry, entryVerificationOn } from "../../../../server/v2/entry";

export const dynamic = "force-dynamic";

// GET  /api/v2/run  → the caller's current run state for this week
// POST /api/v2/run  { openedBy?: "entry" | "rebuy", entryTx? } → open a run
//
// The first V2 gameplay routes, so this is where requireTester() finally gets used. Note the gate
// returns the wallet from a verified pass — the address is never read from the request body, which
// is the whole reason the pass exists (server/accessGate.ts).
//
// Opening a run requires a confirmed ArcadiaPool entry (server/v2/entry.ts). That check is skipped
// only when ARCADIA_POOL_ADDRESS is unset, which logs a warning — a deploy in that state has a
// fictional economy.

export async function GET(req: NextRequest) {
  const gate = requireTester(req);
  if (gate instanceof NextResponse) return gate;
  const { player, chain } = gate;

  try {
    await ensureBooted();
    const weekId = currentWeekId();
    const run = await liveRun(weekId, player, chain);
    if (!run) {
      return NextResponse.json({
        weekId,
        run: null,
        passMark: passMark(),
        questionsPerRound: QUESTIONS_PER_ROUND,
        freeRoundsPerDay: FREE_ROUNDS_PER_DAY,
      });
    }

    const played = await roundsToday(run.id, todayKey());
    return NextResponse.json({
      weekId,
      run: {
        id: run.id,
        multiplierBp: run.multiplierBp,
        band: bandFor(run.multiplierBp).label,
        openedBy: run.openedBy,
      },
      roundsPlayedToday: played,
      freeRoundsLeft: Math.max(0, FREE_ROUNDS_PER_DAY - played),
      passMark: passMark(),
      questionsPerRound: QUESTIONS_PER_ROUND,
      freeRoundsPerDay: FREE_ROUNDS_PER_DAY,
    });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(req: NextRequest) {
  const gate = requireTester(req);
  if (gate instanceof NextResponse) return gate;
  const { player, chain } = gate;

  let body: { entryTx?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    await ensureBooted();
    const weekId = currentWeekId();

    // A player may hold at most one live run. Returning the existing one rather than erroring makes
    // the endpoint idempotent — a double-tapped button opens one run, not two.
    const existing = await liveRun(weekId, player, chain);
    if (existing) {
      return NextResponse.json({
        weekId,
        run: {
          id: existing.id,
          multiplierBp: existing.multiplierBp,
          band: bandFor(existing.multiplierBp).label,
          openedBy: existing.openedBy,
        },
        alreadyOpen: true,
      });
    }

    // Payment. A run must be paid for — otherwise the multipliers the engine tracks are backed by
    // nothing and the weekend payout is a redistribution of an empty pot.
    //
    // Counts ArcadiaPool `Entered` events of kind ENTRY/REBUY, deliberately excluding $0.10 ticket
    // purchases: the contract's `contributed` aggregate would let ten tickets sum to a free entry.
    if (entryVerificationOn()) {
      const check = await checkPaidEntry(weekId, player, chain);
      if (!check.canOpen) {
        return NextResponse.json(
          {
            error:
              check.paidEntries === 0
                ? "no entry found for this week — buy in first"
                : "all paid entries are already in use",
            paidEntries: check.paidEntries,
            runsOpened: check.runsOpened,
          },
          { status: 402 } // Payment Required
        );
      }
    } else {
      // Staging convenience only. Loud, because a production deploy reaching this line means runs
      // are free and the economy is fictional.
      console.warn(
        "[v2/run] paid-entry verification is OFF — set ARCADIA_POOL_ADDRESS to enable it"
      );
    }

    const openedBy = (await hasBustedThisWeek(weekId, player, chain)) ? "rebuy" : "entry";
    const run = await openRun(weekId, player, chain, openedBy, body.entryTx);

    return NextResponse.json({
      weekId,
      run: {
        id: run.id,
        multiplierBp: run.multiplierBp,
        band: bandFor(run.multiplierBp).label,
        openedBy: run.openedBy,
      },
      alreadyOpen: false,
    });
  } catch (err) {
    return dbError(err);
  }
}

/** Has this wallet already busted this week? Decides entry vs. rebuy for the audit trail. */
async function hasBustedThisWeek(weekId: number, player: string, chain: string): Promise<boolean> {
  const res = await mustQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM weekly_runs
      WHERE week_id = $1 AND player = $2 AND chain = $3 AND busted`,
    [weekId, player.toLowerCase(), chain]
  );
  return Number(res.rows[0].n) > 0;
}

/**
 * A database failure on a money path is a 503, never a 200 with empty data. The whole reason
 * server/v2/db.ts throws is so this distinction reaches the client instead of looking like
 * "you have no run".
 */
function dbError(err: unknown): NextResponse {
  if (err instanceof V2DatabaseError) {
    console.error("[v2/run]", err.message);
    return NextResponse.json({ error: "service temporarily unavailable" }, { status: 503 });
  }
  console.error("[v2/run] unexpected:", err);
  return NextResponse.json({ error: "unexpected error" }, { status: 500 });
}
