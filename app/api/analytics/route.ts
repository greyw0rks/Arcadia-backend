import { NextRequest, NextResponse } from "next/server";
import { getAnalytics, type AnalyticsRange } from "../../../server/leaderboard";

// GET /api/analytics?range=7d  → platform stats derived from on-chain Celo (USDm) game events.
const RANGES: AnalyticsRange[] = ["24h", "7d", "30d", "all"];

export async function GET(req: NextRequest) {
  const range = (req.nextUrl.searchParams.get("range") as AnalyticsRange) ?? "7d";
  if (!RANGES.includes(range)) {
    return NextResponse.json({ error: "invalid range" }, { status: 400 });
  }
  try {
    const data = await getAnalytics(range);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: "failed to build analytics", detail: (e as Error).message },
      { status: 502 }
    );
  }
}
