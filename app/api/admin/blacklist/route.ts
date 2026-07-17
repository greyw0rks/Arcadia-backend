import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { ensureBooted } from "../../../../server/bootstrap";
import { requireAdmin } from "../_auth";
import { listBlacklist, blacklistPlayer, unblacklistPlayer } from "../../../../server/blacklist";

export const dynamic = "force-dynamic";

// GET /api/admin/blacklist → list all blacklisted wallets.
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();
  const entries = await listBlacklist();
  return NextResponse.json({ count: entries.length, entries });
}

// POST /api/admin/blacklist  { address, action: "add" | "remove", reason? }
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();

  let body: { address?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { address, action, reason } = body;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }
  const chain = "celo" as const;

  if (action === "remove") {
    await unblacklistPlayer(address, chain);
    return NextResponse.json({ ok: true, address: address.toLowerCase(), action: "removed" });
  }
  if (action === "add" || action === undefined) {
    await blacklistPlayer(address, chain, reason ?? "manual (admin API)", undefined, "admin-api");
    return NextResponse.json({ ok: true, address: address.toLowerCase(), action: "added" });
  }
  return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
}
