import { NextRequest, NextResponse } from "next/server";
import { getGame } from "../../../server/games/registry";
import { createSession, type ChainId } from "../../../server/sessions";
import { isAddress } from "viem";
import { validateStacksAddress } from "@stacks/transactions";
import { MAX_STAKE, difficultyFromStake, roundsFor } from "../../../server/difficulty";

// POST /api/session  { game: string, player: "0x.."|"ST..", chain?: "celo"|"stacks", stake?: number }
// Creates a pending session and returns its on-chain sessionId + the maxRounds to stake against.
// The client then calls start-session(sessionId, stake, maxRounds) on-chain before fetching rounds.
// The round count scales with the bet (higher stake => more rounds), capped by the game's bank so a
// session never repeats a question. The contract enforces the $5 cap; we reject here too to save gas.
function isValidPlayer(player: string, chain: ChainId): boolean {
  return chain === "stacks" ? validateStacksAddress(player) : isAddress(player);
}

export async function POST(req: NextRequest) {
  let body: { game?: string; player?: string; chain?: string; stake?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { game: gameId, player } = body;
  const chain: ChainId = body.chain === "stacks" ? "stacks" : "celo";
  if (!gameId || !player || !isValidPlayer(player, chain)) {
    return NextResponse.json({ error: "game and valid player required" }, { status: 400 });
  }

  const stake = Number(body.stake);
  if (!(stake > 0)) {
    return NextResponse.json({ error: "stake must be greater than 0" }, { status: 400 });
  }
  if (stake > MAX_STAKE[chain]) {
    return NextResponse.json(
      { error: `stake exceeds the ${MAX_STAKE[chain]} ${chain === "stacks" ? "STX" : "cUSD"} max per game` },
      { status: 400 }
    );
  }

  const game = getGame(gameId);
  if (!game || !game.available) {
    return NextResponse.json({ error: "unknown or unavailable game" }, { status: 404 });
  }

  // Bet-scaled round count (the on-chain stake later confirms/overrides this in /api/round).
  const maxRounds = roundsFor(difficultyFromStake(stake, chain), game.bankSize);
  const session = createSession(game, player, maxRounds, chain);
  return NextResponse.json({
    sessionId: session.id,
    maxRounds: session.maxRounds,
    bankSize: game.bankSize,
    chain: session.chain,
    game: { id: game.id, title: game.title },
  });
}
