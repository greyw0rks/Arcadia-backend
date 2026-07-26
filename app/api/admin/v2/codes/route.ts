import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireAdmin } from "../../_auth";
import { ensureBooted } from "../../../../../server/bootstrap";
import { query } from "../../../../../server/db";
import { revokeCode, revokeTester } from "../../../../../server/accessGate";

// Operator management of V2 tester codes. Guarded by the same ADMIN_SECRET as the other
// /api/admin routes.
//
//   GET    /api/admin/v2/codes                     list codes + who redeemed them
//   POST   /api/admin/v2/codes  { label?, maxUses?, expiresInDays? }   mint a code
//   DELETE /api/admin/v2/codes  { code } | { player }                  revoke

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();

  const codes = await query<Record<string, unknown>>(
    `SELECT c.code, c.label, c.max_uses, c.uses, c.revoked, c.expires_at, c.created_at,
            COALESCE(json_agg(json_build_object('address', r.address, 'chain', r.chain,
                     'revoked', r.revoked, 'redeemed_at', r.redeemed_at))
                     FILTER (WHERE r.address IS NOT NULL), '[]') AS redemptions
       FROM access_codes c
       LEFT JOIN code_redemptions r ON r.code = c.code
      GROUP BY c.code
      ORDER BY c.created_at DESC`
  );
  if (!codes) return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  return NextResponse.json({ codes: codes.rows });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();

  let body: { label?: string; maxUses?: number; expiresInDays?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // arcv2- prefix makes codes recognisable in logs and messages; 8 bytes is plenty for an
  // operator-minted invite (these are grants, not guessable secrets protecting funds).
  const code = `arcv2-${randomBytes(8).toString("hex")}`;
  const maxUses = Math.max(1, Math.floor(body.maxUses ?? 1));
  const expiresAt =
    body.expiresInDays && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 86_400_000)
      : null;

  const res = await query(
    `INSERT INTO access_codes (code, label, max_uses, expires_at, created_by)
     VALUES ($1, $2, $3, $4, 'admin-api')`,
    [code, body.label ?? null, maxUses, expiresAt]
  );
  if (!res) return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  return NextResponse.json({ code, maxUses, expiresAt });
}

export async function DELETE(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();

  let body: { code?: string; player?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (body.code) {
    await revokeCode(body.code);
    return NextResponse.json({ ok: true, revoked: { code: body.code } });
  }
  if (body.player) {
    await revokeTester(body.player, "celo");
    return NextResponse.json({ ok: true, revoked: { player: body.player } });
  }
  return NextResponse.json({ error: "code or player required" }, { status: 400 });
}
