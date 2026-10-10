import { NextResponse } from "next/server";
import { playMode } from "../../../server/playMode";
import { xpPerCorrect, xpCompletionBonus } from "../../../server/points";

// GET /api/config — public runtime config the frontend reads to render the right experience.
// `playMode` tells the UI whether to run the free XP flow (no stake/settle) or the paid staking flow.
export async function GET() {
  return NextResponse.json({
    playMode: playMode(),
    xp: {
      perCorrect: xpPerCorrect(),
      completionBonus: xpCompletionBonus(),
    },
  });
}
