import { NextRequest, NextResponse } from "next/server";
import { getTournament } from "../../../server/tournament";

// GET /api/tournament?viewer=<address>
// Returns the current weekly tournament leaderboard + eligibility for the viewer.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const viewer = searchParams.get("viewer") ?? undefined;

  try {
    const result = await getTournament(viewer);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (e) {
    console.error("[tournament] error:", (e as Error).message);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
