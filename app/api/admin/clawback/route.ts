import { NextRequest, NextResponse } from "next/server";
import { ensureBooted } from "../../../../server/bootstrap";
import { requireAdmin } from "../_auth";
import { runClawbackSweep, clawbackThreshold } from "../../../../server/clawback";

export const dynamic = "force-dynamic";

// GET  /api/admin/clawback            → dry-run preview (who WOULD be blacklisted, no changes)
// POST /api/admin/clawback  {dryRun?} → run the sweep (auto-blacklist repeat offenders)
//
// Auth: Bearer ADMIN_SECRET. Point an external cron / uptime pinger at the POST to run it on a
// schedule (e.g. hourly). Idempotent — already-blacklisted wallets are skipped.
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();
  const result = await runClawbackSweep({ dryRun: true });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // no body → real run
  }

  const result = await runClawbackSweep({ dryRun });
  return NextResponse.json({ ...result, thresholdConfigured: clawbackThreshold() });
}
