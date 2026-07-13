import { NextRequest, NextResponse } from "next/server";
import { getGame } from "../../../server/games/registry";
import { createSession, hasUsedDemo, markDemoUsed } from "../../../server/sessions";
import { isAddress } from "viem";
import { MAX_STAKE, difficultyFromStake, roundsFor } from "../../../server/difficulty";
import { ensureBooted } from "../../../server/bootstrap";
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

// Fixed difficulty for the free demo — equivalent to a 1-unit stake (easy end of the curve).
const DEMO_STAKE_EQUIV = 1;

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

  // ---- free one-time demo ----
  if (body.demo) {
    if (hasUsedDemo(player, chain)) {
      return NextResponse.json(
        { error: "This wallet has already used its free demo. Stake to play for real." },
        { status: 403 }
      );
    }
    const difficulty = difficultyFromStake(DEMO_STAKE_EQUIV, chain);
    const maxRounds = roundsFor(difficulty, game.bankSize);
    const session = createSession(game, player, maxRounds, chain, token, {
      isDemo: true,
      difficulty,
    });
    markDemoUsed(player, chain);
    return NextResponse.json({
      sessionId: session.id,
      maxRounds: session.maxRounds,
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
  if (stake > MAX_STAKE[chain]) {
    return NextResponse.json(
      { error: `stake exceeds the ${MAX_STAKE[chain]} ${celoTokenMeta(token).symbol} max per game` },
      { status: 400 }
    );
  }

  // Bet-scaled round count (the on-chain stake later confirms/overrides this in /api/round).
  const maxRounds = roundsFor(difficultyFromStake(stake, chain), game.bankSize);
  const session = createSession(game, player, maxRounds, chain, token, { stake });
  return NextResponse.json({
    sessionId: session.id,
    maxRounds: session.maxRounds,
    bankSize: game.bankSize,
    chain: session.chain,
    token: session.token,
    game: { id: game.id, title: game.title },
  });
}
