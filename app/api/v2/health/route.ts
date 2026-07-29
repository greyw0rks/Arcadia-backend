import { NextResponse } from "next/server";
import { V2_ENABLED } from "../../../../server/v2/flag";

// GET /api/v2/health — probe for the V2 deploy.
//
// Production (V2_ENABLED unset) never reaches this: proxy.ts 404s the whole /api/v2 tree.
// Staging returns 200. That difference is the test that the dark switch works.
//
// (The gate is proxy.ts, not middleware.ts — Next 16 deprecated the middleware convention. Verified
// live 2026-07-29: prod /api/v2/health 404s while prod /api/games still 200s.)

export function GET() {
  return NextResponse.json({ ok: true, v2: V2_ENABLED });
}
