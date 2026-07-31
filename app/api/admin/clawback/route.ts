import { NextRequest, NextResponse } from "next/server";
import { ensureBooted } from "../../../../server/bootstrap";
import { requireAdmin } from "../_auth";
import { runClawbackSweep, clawbackThreshold } from "../../../../server/clawback";
import { autoEnforceOn, sweepIntervalMinutes } from "../../../../server/clawbackScheduler";

export const dynamic = "force-dynamic";

// GET  /api/admin/clawback            → dry-run preview (who WOULD be blacklisted, no changes)
// POST /api/admin/clawback  {dryRun?} → run the sweep (auto-blacklist repeat offenders)
//
// Auth: Bearer ADMIN_SECRET. Idempotent — already-blacklisted wallets are skipped.
//
// A scheduler also runs this periodically (server/clawbackScheduler.ts), but REPORT-ONLY by default:
// it alerts the operator with candidates rather than banning, because the flag thresholds have not
// been calibrated against real play yet (docs/V2_ANTICHEAT_AUDIT.md). This route stays the way to
// deliberately enforce.
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  await ensureBooted();
  const result = await runClawbackSweep({ dryRun: true });
  return NextResponse.json({
    ...result,
    scheduler: {
      everyMinutes: sweepIntervalMinutes(),
      autoEnforce: autoEnforceOn(),
    },
  });
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
