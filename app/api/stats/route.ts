import { NextResponse } from "next/server";
import { getAnalytics, type AnalyticsRange } from "../../../server/leaderboard";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set<AnalyticsRange>(["24h", "7d", "30d", "all"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("range") ?? "7d";
  const range = VALID_RANGES.has(raw as AnalyticsRange) ? (raw as AnalyticsRange) : "7d";
  const data = await getAnalytics(range);
  return NextResponse.json(data);
}
