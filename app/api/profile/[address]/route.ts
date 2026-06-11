import { NextRequest, NextResponse } from "next/server";
import { getPlayerProfile } from "../../../../server/leaderboard";
import { setProfileOverlay } from "../../../../server/profileStore";

// GET  /api/profile/:address          → on-chain stats + best-effort username/avatar overlay
// PUT  /api/profile/:address  {username, avatar}  → save the cosmetic overlay (in-memory, volatile)

export async function GET(_req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  try {
    const profile = await getPlayerProfile(address);
    return NextResponse.json({ profile });
  } catch (e) {
    return NextResponse.json(
      { error: "failed to build profile", detail: (e as Error).message },
      { status: 502 }
    );
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  let body: { username?: string; avatar?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  setProfileOverlay(address, {
    username: body.username ?? null,
    avatar: body.avatar ?? null,
  });
  return NextResponse.json({ ok: true });
}
