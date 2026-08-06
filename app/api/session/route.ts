import { NextRequest, NextResponse } from "next/server";
import { getGame } from "../../../server/games/registry";
import { createSession, hasUsedDemo, markDemoUsed } from "../../../server/sessions";
import { isAddress } from "viem";
import { MAX_STAKE, MIN_STAKE, difficultyFromStake } from "../../../server/difficulty";
import { CASUAL_QUESTIONS, casualPassMark, casualFailMark, casualMaxSteps } from "../../../server/engine";
import { ensureBooted } from "../../../server/bootstrap";
import { consumePlay, logPlay, MAX_PLAYS } from "../../../server/cooldown";
import { isBlacklisted } from "../../../server/blacklist";
import { celoTokenMeta, DEFAULT_CELO_TOKEN, type CeloToken } from "../../../lib/contract";

// POST /api/session  { game, player, token?, stake?, demo? }
// Creates a pending session and returns its on-chain sessionId + the maxRounds to stake against.
// `token` selects the Celo stake token (cUSD/USDC/USDT) — i.e. which QuizArcade instance the session
// settles against.
//
// Demo sessions (demo:true) are a free, one-per-wallet trial: no stake, no on-chain tx, no payout.

function parseCeloToken(value: unknown): CeloToken {
  return value === "usdc" || value === "usdt" || value === "cusd"
    ? (value as CeloToken)
    : DEFAULT_CELO_TOKEN;
}

// Fixed stake-equivalent for the free demo. Uses the minimum-bet fraction so difficulty is floored
// (hard questions) like every real session; the demo plays the full 12-question three-zone round.
const DEMO_STAKE_EQUIV = 0.1;

export async function POST(req: NextRequest) {
  await ensureBooted();
  let body: {
    game?: string;
    player?: string;
    token?: string;
    stake?: number;
    demo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { game: gameId, player } = body;
  const chain = "celo" as const;
  const token: CeloToken = parseCeloToken(body.token);
  if (!gameId || !player || !isAddress(player)) {
    return NextResponse.json({ error: "game and valid player required" }, { status: 400 });
  }

  const game = getGame(gameId);
  if (!game || !game.available) {
    return NextResponse.json({ error: "unknown or unavailable game" }, { status: 404 });
  }

  // Blacklisted wallets cannot start any session (demo or real).
  if (isBlacklisted(player, chain)) {
    return NextResponse.json({ error: "This wallet is not permitted to play." }, { status: 403 });
  }

  // ---- free one-time demo ----
  if (body.demo) {
    if (hasUsedDemo(player, chain)) {
      return NextResponse.json(
        { error: "This wallet has already used its free demo. Stake to play for real." },
        { status: 403 }
      );
    }
    const difficulty = difficultyFromStake(DEMO_STAKE_EQUIV, chain);
    // One graduated round of 12 questions. maxRounds = the +0.1x steps a perfect round earns (the
    // payout-cap basis; demos never settle on-chain but keep the same shape as a real session).
    const session = createSession(game, player, casualMaxSteps(), chain, token, {
      isDemo: true,
      difficulty,
      questions: CASUAL_QUESTIONS,
    });
    markDemoUsed(player, chain);
    logPlay({ player, chain, gameId: game.id, sessionId: session.id, isDemo: true });
    return NextResponse.json({
      sessionId: session.id,
      maxRounds: session.maxRounds, // graduated pass steps (payout-cap basis)
      questions: session.questions, // 12 questions served
      passMark: casualPassMark(),
      failMark: casualFailMark(),
      bankSize: game.bankSize,
      chain: session.chain,
      token: session.token,
      demo: true,
      game: { id: game.id, title: game.title },
    });
  }

  const stake = Number(body.stake);
  if (!(stake > 0)) {
    return NextResponse.json({ error: "stake must be greater than 0" }, { status: 400 });
  }
  if (stake < MIN_STAKE[chain]) {
    return NextResponse.json(
      { error: `Min bet is ${MIN_STAKE[chain]} ${celoTokenMeta(token).symbol} per game` },
      { status: 400 }
    );
  }
  if (stake > MAX_STAKE[chain]) {
    return NextResponse.json(
      { error: `stake exceeds the ${MAX_STAKE[chain]} ${celoTokenMeta(token).symbol} max per game` },
      { status: 400 }
    );
  }

  // Per-game play limit + cooldown: at most MAX_PLAYS plays of this game per wallet, then a lock.
  // Consumed here on session start (before any on-chain stake) so a rejected play costs no slot.
  const cd = await consumePlay(player, chain, game.id);
  if (!cd.allowed) {
    const mins = Math.ceil(cd.retryAfterMs / 60000);
    return NextResponse.json(
      {
        error: `You've played ${game.title} ${MAX_PLAYS} times. Cooldown active — try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
        cooldown: { lockedUntil: cd.lockedUntil, retryAfterMs: cd.retryAfterMs },
      },
      { status: 429 }
    );
  }

  // Casual is now one graduated round of 12 questions. maxRounds = the number of +0.1x steps a
  // perfect round earns (4 at the default pass mark → the contract caps/reserves at 1.4x),
  // independent of stake. Stake still scales difficulty and the absolute payout base, not the ceiling.
  const session = createSession(game, player, casualMaxSteps(), chain, token, {
    stake,
    questions: CASUAL_QUESTIONS,
  });
  logPlay({
    player,
    chain,
    gameId: game.id,
    sessionId: session.id,
    stake,
    unit: celoTokenMeta(token).symbol,
  });
  return NextResponse.json({
    sessionId: session.id,
    maxRounds: session.maxRounds, // graduated pass steps → payout cap 1.0 + 0.1·maxRounds
    questions: session.questions, // 12 questions served
    passMark: casualPassMark(),
    failMark: casualFailMark(),
    bankSize: game.bankSize,
    chain: session.chain,
    token: session.token,
    game: { id: game.id, title: game.title },
  });
}
