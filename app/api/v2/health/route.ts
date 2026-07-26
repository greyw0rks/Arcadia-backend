import { NextResponse } from "next/server";
import { V2_ENABLED } from "../../../../server/v2/flag";

// GET /api/v2/health — probe for the V2 deploy.
//
// Production (V2_ENABLED unset) never reaches this: middleware.ts 404s the whole /api/v2 tree.
// Staging returns 200. That difference is the test that the dark switch works.

export function GET() {
  return NextResponse.json({ ok: true, v2: V2_ENABLED });
}
