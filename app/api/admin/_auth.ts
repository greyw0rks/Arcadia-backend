import { NextRequest, NextResponse } from "next/server";

// Shared admin auth for /api/admin/* routes. Requires ADMIN_SECRET to be set and the caller to send
// it as a Bearer token (Authorization: Bearer <secret>) or an x-admin-secret header. Returns a
// NextResponse to short-circuit on failure, or null when authorized.
export function requireAdmin(req: NextRequest): NextResponse | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // Fail CLOSED: no secret configured means admin endpoints are disabled entirely.
    return NextResponse.json({ error: "admin endpoints disabled (ADMIN_SECRET not set)" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const header = req.headers.get("x-admin-secret");
  if (bearer !== secret && header !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
