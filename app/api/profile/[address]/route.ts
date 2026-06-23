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
  let body: { username?: string; avatar?: string; linkedStacksAddress?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const patch: Parameters<typeof setProfileOverlay>[1] = {};
  if (body.username !== undefined) patch.username = body.username ?? null;
  if (body.avatar !== undefined) patch.avatar = body.avatar ?? null;
  if (body.linkedStacksAddress !== undefined) patch.linkedStacksAddress = body.linkedStacksAddress ?? null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  setProfileOverlay(address, patch);
  return NextResponse.json({ ok: true });
}
