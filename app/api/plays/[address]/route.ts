import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { ensureBooted } from "../../../../server/bootstrap";
import { getPlaysByAddress, peekCooldown } from "../../../../server/cooldown";
import { getGame, listGameMeta } from "../../../../server/games/registry";

// GET /api/plays/:address  → every game this wallet has played (from the persistent game_plays log),
// plus the current per-game cooldown status. Answers "what game did address X play?".
export async function GET(_req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  await ensureBooted();
  const { address } = await ctx.params;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  const chain = "celo" as const;

  const plays = await getPlaysByAddress(address, chain);

  // Attach a human title to each play and summarise per-game counts.
  const withTitle = plays.map((p) => ({
    ...p,
    title: getGame(p.gameId)?.title ?? p.gameId,
  }));
  const counts: Record<string, number> = {};
  for (const p of plays) counts[p.gameId] = (counts[p.gameId] ?? 0) + 1;

  // Cooldown status for every registered game (only meaningful ones will show non-default state).
  const cooldowns = await Promise.all(
    listGameMeta().map(async (m) => ({
      gameId: m.id,
      title: m.title,
      ...(await peekCooldown(address, chain, m.id)),
    }))
  );

  return NextResponse.json({
    address: address.toLowerCase(),
    totalPlays: plays.length,
    countsByGame: counts,
    plays: withTitle,
    cooldowns: cooldowns.filter((c) => c.playsUsed > 0 || !c.allowed),
  });
}
