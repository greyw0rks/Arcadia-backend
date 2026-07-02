import { NextRequest, NextResponse } from "next/server";
import { getGame } from "../../../server/games/registry";
import {
  createSession,
  hasUsedDemo,
  markDemoUsed,
  type ChainId,
} from "../../../server/sessions";
import { isAddress } from "viem";
import { validateStacksAddress } from "@stacks/transactions";
import { MAX_STAKE, difficultyFromStake, roundsFor } from "../../../server/difficulty";
import { CELO_TOKENS, DEFAULT_CELO_TOKEN, type CeloToken } from "../../../lib/contract";

// POST /api/session  { game, player, chain?, token?, stake?, demo? }
// Creates a pending session and returns its on-chain sessionId + the maxRounds to stake against.
// The client then calls start-session(sessionId, stake, maxRounds) on-chain before fetching rounds.
// The round count scales with the bet (higher stake => more rounds), capped by the game's bank so a
// session never repeats a question. The contract enforces the $5 cap; we reject here too to save gas.
// `token` selects the Celo stake token (cUSD/USDC/USDT) — i.e. which QuizArcade instance the session
// settles against; it's ignored for Stacks (STX has no token sub-dimension).
//
// Demo sessions (demo:true) are a free, one-per-wallet trial: no stake, no on-chain tx, no payout.
// They run at a fixed (easy) difficulty and never settle. Enforced once-per-wallet here.
function isValidPlayer(player: string, chain: ChainId): boolean {
  return chain === "stacks" ? validateStacksAddress(player) : isAddress(player);
}

function stakeSymbol(chain: ChainId, token: CeloToken | undefined): string {
  if (chain === "base") return "USDC";
  if (chain === "stacks") return "STX";
  return CELO_TOKENS[token!].symbol;
}

function parseCeloToken(value: unknown): CeloToken {
  return value === "usdc" || value === "usdt" || value === "cusd"
    ? (value as CeloToken)
    : DEFAULT_CELO_TOKEN;
}

// Fixed difficulty for the free demo — equivalent to a 1-unit stake (easy end of the curve).
const DEMO_STAKE_EQUIV = 1;

export async function POST(req: NextRequest) {
  let body: {
    game?: string;
    player?: string;
    chain?: string;
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
  const chain: ChainId =
    body.chain === "stacks" ? "stacks" : body.chain === "base" ? "base" : "celo";
  // Token is a Celo-only sub-dimension (selects which QuizArcade instance). Base is USDC-only
  // (no token routing); Stacks is STX-only.
  const token: CeloToken | undefined = chain === "celo" ? parseCeloToken(body.token) : undefined;
  if (!gameId || !player || !isValidPlayer(player, chain)) {
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
      { error: `stake exceeds the ${MAX_STAKE[chain]} ${stakeSymbol(chain, token)} max per game` },
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
