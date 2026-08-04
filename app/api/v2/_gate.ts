import { NextRequest, NextResponse } from "next/server";
import { hasV2Access } from "../../../server/accessGate";
import { PASS_COOKIE, verifyPass } from "../../../server/v2/pass";
import { V2_PUBLIC } from "../../../server/v2/flag";

// Shared tester auth for /api/v2/* routes — same contract as requireAdmin in ../admin/_auth.ts:
// returns a NextResponse to short-circuit on failure, or the proven wallet when authorized.
//
// Two layers, both required:
//   1. verifyPass — the caller holds a valid HMAC pass (proved wallet ownership at redeem time).
//   2. hasV2Access — that wallet is still on the allowlist. Passes are 7-day bearer tokens, so
//      this is what makes revocation bite immediately instead of at pass expiry.
//
// When V2_PUBLIC is set (staging-only public beta) layer 2 is dropped: there is no allowlist to be
// on. Layer 1 STILL holds — a valid pass is required, because runs and payouts must bind to a proven
// wallet. "Open to everyone" removes the invite, not the wallet auth.
//
// Call as the FIRST line of every /api/v2 route handler, before body parsing:
//   const gate = requireTester(req);
//   if (gate instanceof NextResponse) return gate;
//   const { player, chain } = gate;
export function requireTester(
  req: NextRequest
): NextResponse | { player: string; chain: string } {
  const pass =
    req.cookies.get(PASS_COOKIE)?.value ??
    (req.headers.get("authorization")?.startsWith("Bearer ")
      ? req.headers.get("authorization")!.slice(7)
      : null);
  if (!pass) {
    return NextResponse.json({ error: "tester access required" }, { status: 401 });
  }
  const verified = verifyPass(pass);
  if (!verified) {
    return NextResponse.json({ error: "invalid or expired pass" }, { status: 401 });
  }
  if (!V2_PUBLIC && !hasV2Access(verified.player, verified.chain)) {
    return NextResponse.json({ error: "access revoked" }, { status: 403 });
  }
  return verified;
}
