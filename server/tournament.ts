// Weekly tournament eligibility engine.
//
// Rules (agreed in spec):
//   - Prize pool: $50 per week
//   - Eligibility window: Monday 00:00 UTC → Sunday 23:59 UTC
//   - Only qualifying games count: difficulty >= 0.5 (stake >= $0.50)
//   - Win rate across qualifying games this week must be >= 95%
//   - Max 20 qualifying games counted per player per week (first 20 by timestamp)
//
// The engine reads from the in-memory leaderboard index (server/leaderboard.ts) so it
// automatically picks up games as they are indexed, without a separate scan.

import { ensureLeaderboardFresh, getPlayerAggregates } from "./leaderboard";

// ---- constants ----

export const PRIZE_POOL_USD = 50;
export const MIN_DIFFICULTY = 0.5; // stake / maxStake threshold for "medium or higher"
export const MIN_WIN_RATE = 0.95;  // 95% on qualifying games this week
export const MAX_QUALIFYING_GAMES = 20;

// ---- week window ----

/** Start of the current ISO week (Monday 00:00:00 UTC) in ms. */
export function currentWeekStartMs(): number {
  const now = new Date();
  // getUTCDay(): 0=Sun … 6=Sat. ISO week starts Monday.
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon...
  const daysSinceMon = (dayOfWeek + 6) % 7; // 0 on Mon, 6 on Sun
  const weekStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMon
  );
  return weekStart;
}

export function currentWeekEndMs(): number {
  return currentWeekStartMs() + 7 * 24 * 60 * 60 * 1000 - 1;
}

// ---- types ----

export interface TournamentEntry {
  rank: number;
  address: string;
  chain: "celo";
  unit: string;
  qualifyingGames: number;
  wins: number;
  winRate: number;   // 0–100 integer
  totalStaked: number;
  totalWinnings: number;
  netProfit: number;
  eligible: boolean; // meets win-rate AND at least 1 qualifying game
}

export interface TournamentResult {
  weekStartMs: number;
  weekEndMs: number;
  prizePoolUsd: number;
  leaderboard: TournamentEntry[];
  viewerEntry: TournamentEntry | null;
}

// ---- core ----

export async function getTournament(viewer?: string): Promise<TournamentResult> {
  await ensureLeaderboardFresh();

  const weekStart = currentWeekStartMs();
  const weekEnd = currentWeekEndMs();
  const aggregates = getPlayerAggregates();

  const entries: TournamentEntry[] = [];

  for (const p of aggregates) {
    // Filter to qualifying games this week, sorted chronologically, capped at MAX_QUALIFYING_GAMES.
    const weekGames = p.games
      .filter((g) => g.approxTs >= weekStart && g.approxTs <= weekEnd && g.difficulty >= MIN_DIFFICULTY)
      .sort((a, b) => a.approxTs - b.approxTs)
      .slice(0, MAX_QUALIFYING_GAMES);

    if (weekGames.length === 0) continue;

    const wins = weekGames.filter((g) => g.won).length;
    const winRate = wins / weekGames.length;
    const totalStaked = weekGames.reduce((s, g) => s + g.stake, 0);
    const totalWinnings = weekGames.reduce((s, g) => s + g.payout, 0);

    entries.push({
      rank: 0, // filled below
      address: p.address,
      chain: p.chain,
      unit: p.unit,
      qualifyingGames: weekGames.length,
      wins,
      winRate: Math.round(winRate * 100),
      totalStaked: Math.round(totalStaked * 100) / 100,
      totalWinnings: Math.round(totalWinnings * 100) / 100,
      netProfit: Math.round((totalWinnings - totalStaked) * 100) / 100,
      eligible: winRate >= MIN_WIN_RATE,
    });
  }

  // Rank: eligible players first (by qualifying games desc, then winRate desc), then ineligible.
  entries.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.qualifyingGames !== a.qualifyingGames) return b.qualifyingGames - a.qualifyingGames;
    return b.winRate - a.winRate;
  });

  entries.forEach((e, i) => { e.rank = i + 1; });

  const viewerKey = viewer ? viewer.startsWith("0x") ? viewer.toLowerCase() : viewer : null;
  const viewerEntry = viewerKey
    ? (entries.find((e) => e.address.toLowerCase() === viewerKey.toLowerCase()) ?? null)
    : null;

  return { weekStartMs: weekStart, weekEndMs: weekEnd, prizePoolUsd: PRIZE_POOL_USD, leaderboard: entries, viewerEntry };
}
