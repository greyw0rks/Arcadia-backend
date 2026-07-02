// In-memory game history for completed (finalized) sessions.
//
// Supplements the on-chain leaderboard scan in server/leaderboard.ts so that stats appear
// immediately after a game is finalized — without waiting for the blockchain event indexer.
// On server restart the data is rebuilt from the on-chain scan; in practice this fills within the
// 30-second TTL refresh, so the gap is minimal.

export interface HistoryRecord {
  sessionId: string;
  player: string; // normalized (lowercased for EVM, as-is for Stacks)
  chain: "celo" | "base" | "stacks";
  unit: "USDm" | "STX";
  stake: number;
  multiplierBp: number;
  payout: number;
  won: boolean;
}

const bySession = new Map<string, HistoryRecord>();
const byPlayer = new Map<string, string[]>(); // player → sessionId[]

function playerKey(player: string): string {
  return player.startsWith("0x") ? player.toLowerCase() : player;
}

export function recordCompletedGame(rec: HistoryRecord): void {
  if (bySession.has(rec.sessionId)) return; // idempotent
  bySession.set(rec.sessionId, rec);
  const k = playerKey(rec.player);
  const arr = byPlayer.get(k) ?? [];
  arr.push(rec.sessionId);
  byPlayer.set(k, arr);
}

export function getPlayerHistory(address: string): HistoryRecord[] {
  const k = playerKey(address);
  const ids = byPlayer.get(k) ?? [];
  return ids.map((id) => bySession.get(id)!).filter(Boolean);
}

export function hasSession(sessionId: string): boolean {
  return bySession.has(sessionId);
}
