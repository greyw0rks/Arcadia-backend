import { NextRequest, NextResponse } from "next/server";
import { getSession, finalMultiplierBp } from "../../../server/sessions";
import { signSettlement } from "../../../server/signer";
import { recordCompletedGame } from "../../../server/gameHistory";
import { DEFAULT_RAKE_BPS, BPS } from "../../../server/difficulty";
import { celoTokenMeta } from "../../../lib/contract";
import { ensureBooted } from "../../../server/bootstrap";
import { summarize, classify, enforcementOn } from "../../../server/anticheat";
import { sendCheatAlert } from "../../../server/alerts";
import { isBlacklisted } from "../../../server/blacklist";
import { getGame } from "../../../server/games/registry";
import { recordFlag } from "../../../server/cheatLog";

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

  // Blacklisted wallets are never settled (manual operator ban; always active). Stake stays
  // refundable via cancelExpired.
  if (isBlacklisted(session.player, session.chain)) {
    session.finalized = true;
    return NextResponse.json(
      { error: "This wallet is not permitted to settle. Your stake is refundable after the session expires." },
      { status: 403 }
    );
  }

  // ── Anti-cheat: classify the session's answer timings ──────────────────────
  // Only meaningful for real (staked) sessions with a positive payout at risk.
  const stats = summarize(session.timings);
  const cls = classify(stats);
  if (cls.verdict !== "clean") {
    const enforced = enforcementOn() && cls.verdict === "flagged";
    const game = getGame(session.gameId);
    const unit = celoTokenMeta(session.token).symbol;

    // Always persist the flag + timing stats for later review / statistical clawback.
    recordFlag({
      sessionId: session.id,
      player: session.player,
      chain: session.chain,
      gameId: session.gameId,
      verdict: cls.verdict,
      reasons: cls.reasons,
      stats,
      stake: session.stake,
      unit,
      multiplierBp,
      enforced,
    });

    console.warn(
      `[anticheat] ${cls.verdict}${enforced ? " ENFORCED" : ""} session=${session.id} player=${session.player} game=${session.gameId} reasons=${JSON.stringify(cls.reasons)} stats=${JSON.stringify(stats)}`
    );

    // Notify the operator on any non-clean verdict (flagged and suspect).
    sendCheatAlert({
      player: session.player,
      gameId: session.gameId,
      gameTitle: game?.title ?? session.gameId,
      sessionId: session.id,
      chain: session.chain,
      stake: session.stake,
      unit,
      multiplierBp,
      enforced,
      classification: cls,
    });

    // Enforcement (only when ANTICHEAT_ENFORCE=true AND verdict is a hard flag): refuse to sign.
    // The player's stake is NOT lost — with no signature the session simply can't settle, and it
    // becomes refundable via the contract's cancelExpired() after the TTL.
    if (enforced) {
      session.finalized = true; // block re-attempts at signing
      return NextResponse.json(
        { error: "This session was flagged by anti-cheat and cannot be settled. Your stake is refundable after the session expires." },
        { status: 403 }
      );
    }
  }

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
