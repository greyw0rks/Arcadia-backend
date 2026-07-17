import { NextRequest, NextResponse } from "next/server";
import { ensureBooted } from "../../../../server/bootstrap";
import { requireAdmin } from "../_auth";
import { listFlags, getRepeatOffenders } from "../../../../server/cheatLog";

export const dynamic = "force-dynamic";

// GET /api/admin/flags?verdict=flagged&player=0x..&limit=100&offenders=1
// Review anti-cheat flags. With offenders=1, also returns wallets aggregated over the threshold.
// Auth: Bearer ADMIN_SECRET (or x-admin-secret header).
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();

  const sp = req.nextUrl.searchParams;
  const verdictRaw = sp.get("verdict");
  const verdict = verdictRaw === "suspect" || verdictRaw === "flagged" ? verdictRaw : undefined;
  const player = sp.get("player") ?? undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const chain = "celo" as const;

  const flags = await listFlags({ verdict, player, chain, limit });

  let offenders;
  if (sp.get("offenders")) {
    const min = sp.get("min") ? Math.max(1, Number(sp.get("min"))) : 2;
    offenders = await getRepeatOffenders(min, chain);
  }

  return NextResponse.json({ count: flags.length, flags, offenders });
}
