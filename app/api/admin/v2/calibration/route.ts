import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_auth";
import { ensureBooted } from "../../../../../server/bootstrap";
import { calibrationReport } from "../../../../../server/v2/calibration";
import { V2_ENABLED } from "../../../../../server/v2/flag";

// GET /api/admin/v2/calibration?minAnswers=20
//
// The measured version of the four accuracies the V2 difficulty model assumes (easy 85 / medium 65 /
// hard 45 / extreme 30, spec §4.1). Until `byTier` here disagrees or agrees with those, the bust
// rates and pass mark in §4.2 are provisional.
//
// `minAnswers` filters the skill distribution to players with enough answers to have a meaningful
// accuracy — a tester who played three rounds is noise, not a data point.
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  if (!V2_ENABLED) {
    return NextResponse.json({ error: "V2 is not enabled on this deploy" }, { status: 404 });
  }
  await ensureBooted();

  const raw = Number(req.nextUrl.searchParams.get("minAnswers"));
  const minAnswers = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;

  const report = await calibrationReport(minAnswers);
  if (!report) return NextResponse.json({ error: "db unavailable" }, { status: 503 });
  return NextResponse.json(report);
}
