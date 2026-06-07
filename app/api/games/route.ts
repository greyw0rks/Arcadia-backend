import { NextResponse } from "next/server";
import { listGameMeta } from "../../../server/games/registry";

// GET /api/games -> metadata for the lobby grid.
export async function GET() {
  return NextResponse.json({ games: listGameMeta() });
}
