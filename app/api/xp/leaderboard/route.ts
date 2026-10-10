import { NextRequest, NextResponse } from "next/server";
import { ensureBooted } from "../../../../server/bootstrap";
import { topPoints } from "../../../../server/points";

// GET /api/xp/leaderboard?limit=50 — top wallets by Arcade XP.
export async function GET(req: NextRequest) {
  await ensureBooted();
  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 50;
  const leaderboard = await topPoints(limit);
  return NextResponse.json({ leaderboard });
}
