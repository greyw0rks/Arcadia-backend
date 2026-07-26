import { NextResponse } from "next/server";

// Hides every V2 surface unless V2_ENABLED=true on this deploy.
//
// Returns 404, not 403: production should not admit that these routes exist. A 403 tells anyone
// probing that there is an unreleased feature here and invites them to hunt for the way in.
//
// This is the outer shell only — it answers "does V2 exist on this deploy?", never "is this caller
// allowed?". Per-tester access is enforced inside the route handlers, which can reach the database;
// this file cannot, so it must not be the only gate.
//
// Deliberately does not import server/v2/flag.ts: this file is bundled for the edge runtime and
// pulling in server modules risks dragging their dependencies along with it.
//
// Named proxy.ts, not middleware.ts — Next 16 deprecated the middleware convention in favour of this.

export default function proxy() {
  if (process.env.V2_ENABLED === "true") return NextResponse.next();
  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: ["/api/v2/:path*", "/v2/:path*"],
};
