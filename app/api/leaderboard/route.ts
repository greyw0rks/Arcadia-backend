import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, type Period, type Metric } from "../../../server/leaderboard";

// GET /api/leaderboard?period=allTime&metric=winnings&viewer=0x..
// Returns the on-chain-derived ranking for the period+metric, plus the viewer's own rank (if any).
const PERIODS: Period[] = ["daily", "weekly", "monthly", "allTime"];
const METRICS: Metric[] = ["winnings", "winRate", "gamesPlayed", "highestMultiplier"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const period = (sp.get("period") as Period) ?? "allTime";
  const metric = (sp.get("metric") as Metric) ?? "winnings";
  const viewer = sp.get("viewer") ?? undefined;

  if (!PERIODS.includes(period) || !METRICS.includes(metric)) {
    return NextResponse.json({ error: "invalid period or metric" }, { status: 400 });
  }

  try {
    const data = await getLeaderboard(period, metric, viewer || undefined);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "failed to build leaderboard", detail: (e as Error).message },
      { status: 502 }
    );
  }
}
