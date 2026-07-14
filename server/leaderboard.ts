// On-chain leaderboard / profile indexer.
//
// There is no database: the authoritative record of completed games lives in the QuizArcade v2
// contract's events. This module maintains a singleton in-memory index built by scanning
// SessionStarted / SessionSettled on the single ARCADE_ADDRESS (v2 is multi-token — USDm, USDC,
// USDT all emit from one contract). Events carry the token address; decimal conversion is driven
// by TOKEN_DECIMALS, not hardcoded.
//
// Refresh is incremental (block cursor), single-flight, and TTL-gated so concurrent requests
// never trigger overlapping scans. The index is process-lived and rebuilt on restart.

import { createPublicClient, http } from "viem";
import { celoChain, RPC_URL, ARCADE_ADDRESS, CELO_TOKENS } from "../lib/contract";
import { BPS } from "./difficulty";
import { ARCADE_ABI } from "../lib/abi";
import { getProfileOverlay } from "./profileStore";
import { getPlayerHistory } from "./gameHistory";

export type Period = "daily" | "weekly" | "monthly" | "allTime";
export type Metric = "winnings" | "winRate" | "gamesPlayed" | "highestMultiplier";

const ZERO = "0x0000000000000000000000000000000000000000";

// ---- tunables (env, all optional; sensible fallbacks) ----
// Celo's public RPC rejects eth_getLogs spans > ~50k blocks; 45_000 is the safe ceiling.
const CELO_CHUNK = BigInt(process.env.CELO_LOG_CHUNK ?? "45000");
const CELO_LOOKBACK = BigInt(process.env.CELO_INDEX_LOOKBACK ?? "1000000");
const CELO_FROM_BLOCK = process.env.CELO_INDEX_FROM_BLOCK
  ? BigInt(process.env.CELO_INDEX_FROM_BLOCK)
  : null;
const CELO_BLOCKS_PER_DAY = Number(process.env.CELO_BLOCKS_PER_DAY ?? "86400");
const REFRESH_TTL_MS = Number(process.env.LEADERBOARD_TTL_MS ?? "30000");

export interface GameRecord {
  block: number; // EVM block number (drives period filter + ordering)
  approxTs: number; // approximate wall-clock ms (for weekly tournament windowing)
  stake: number; // gross stake, human units
  payout: number; // settled payout, human units
  multiplierBp: number;
  won: boolean; // final multiplier above break-even (1.0x)
  difficulty: number; // 0..1 (stake / maxStake); used for tournament eligibility
}

export interface PlayerAgg {
  address: string;
  chain: "celo";
  unit: string; // symbol of the token used in most-recent game (USDm / USDC / USDT)
  games: GameRecord[]; // chronological (ascending block)
}

const players = new Map<string, PlayerAgg>();
const pendingStakes = new Map<string, { stake: number; effectiveStake: number }>();
const seenSettled = new Set<string>();
const celoCursors = new Map<string, bigint>();
let celoHead = 0;

let lastRefresh = 0;
let inflight: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fromHuman(base: bigint, decimals: number): number {
  // Number() is safe at stablecoin magnitudes; any precision loss is irrelevant for display+sort.
  return Number(base) / 10 ** decimals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function unitOf(tokenAddress: string): string {
  const lc = tokenAddress.toLowerCase();
  for (const meta of Object.values(CELO_TOKENS)) {
    if (meta.tokenAddress.toLowerCase() === lc) return meta.symbol;
  }
  return "USDm";
}

/** Normalise EVM addresses to lowercase for consistent Map keys. */
function normalizeAddr(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

function getPlayer(address: string, chain: "celo", unit: string): PlayerAgg {
  let p = players.get(address);
  if (!p) {
    p = { address, chain, unit, games: [] };
    players.set(address, p);
  }
  return p;
}

function recordGame(
  address: string,
  chain: "celo",
  unit: string,
  rec: GameRecord
): void {
  const p = getPlayer(address, chain, unit);
  p.games.push(rec);
}

// Build a map from token address (lowercase) → decimals for event-time decimal lookup.
// v2 events carry the token address; we look up decimals here rather than assuming a fixed value.
const TOKEN_DECIMALS = new Map<string, number>(
  Object.values(CELO_TOKENS).map((t) => [t.tokenAddress.toLowerCase(), t.decimals])
);
function decimalsForToken(tokenAddr: string): number {
  return TOKEN_DECIMALS.get(tokenAddr.toLowerCase()) ?? 18; // default 18 for unknown tokens
}

// ---------------------------------------------------------------------------
// Celo (EVM) scan — v2: single ARCADE_ADDRESS, events carry token address
// ---------------------------------------------------------------------------

async function refreshCelo(): Promise<void> {
  const client = createPublicClient({ chain: celoChain, transport: http(RPC_URL) });
  const head = await client.getBlockNumber();
  celoHead = Number(head);

  if (!ARCADE_ADDRESS || ARCADE_ADDRESS.toLowerCase() === ZERO) return;

  const defaultStart = CELO_FROM_BLOCK ?? (head > CELO_LOOKBACK ? head - CELO_LOOKBACK : 0n);
  let from = celoCursors.get(ARCADE_ADDRESS) ?? defaultStart;

  while (from <= head) {
    const to = from + CELO_CHUNK - 1n > head ? head : from + CELO_CHUNK - 1n;
    try {
      const [started, settled] = await Promise.all([
        client.getContractEvents({
          address: ARCADE_ADDRESS,
          abi: ARCADE_ABI,
          eventName: "SessionStarted",
          fromBlock: from,
          toBlock: to,
        }),
        client.getContractEvents({
          address: ARCADE_ADDRESS,
          abi: ARCADE_ABI,
          eventName: "SessionSettled",
          fromBlock: from,
          toBlock: to,
        }),
      ]);

      for (const log of started) {
        // v2 SessionStarted: (sessionId, player, token, stake, effectiveStake, reserve, maxRounds, expiry)
        const a = log.args as { sessionId: string; token: string; stake: bigint; effectiveStake: bigint };
        const dec = decimalsForToken(a.token);
        pendingStakes.set(`celo:${a.sessionId}`, {
          stake: fromHuman(a.stake, dec),
          effectiveStake: fromHuman(a.effectiveStake, dec),
        });
      }

      for (const log of settled) {
        // v2 SessionSettled: (sessionId, player, token, multiplierBp, payout)
        const a = log.args as { sessionId: string; player: string; token: string; multiplierBp: bigint; payout: bigint };
        const skey = `celo:${a.sessionId}`;
        if (seenSettled.has(skey)) continue;
        seenSettled.add(skey);
        const dec = decimalsForToken(a.token);
        const mul = Number(a.multiplierBp);
        const payout = fromHuman(a.payout, dec);
        const ps = pendingStakes.get(skey);
        // Fallback when the start event predates our scan window.
        const stake = ps?.stake ?? (mul > 0 ? (payout * BPS) / mul : payout);
        const blockNum = Number(log.blockNumber);
        const daysAgo = (celoHead - blockNum) / CELO_BLOCKS_PER_DAY;
        recordGame(a.player.toLowerCase(), "celo", unitOf(a.token), {
          block: blockNum,
          approxTs: Date.now() - Math.max(0, daysAgo) * 86_400_000,
          stake,
          payout,
          multiplierBp: mul,
          won: mul > BPS,
          difficulty: Math.min(1, stake),
        });
      }

      celoCursors.set(ARCADE_ADDRESS, to + 1n);
      from = to + 1n;
    } catch (e) {
      console.warn(`[leaderboard] celo scan ${from}-${to} failed: ${(e as Error).message}`);
      celoCursors.set(ARCADE_ADDRESS, from);
      break;
    }
  }

  // Sort all player game lists once after the full scan, not per-event.
  for (const p of players.values()) {
    p.games.sort((a, b) => a.block - b.block);
  }
}

// ---------------------------------------------------------------------------
// Refresh orchestration (single-flight + TTL)
// ---------------------------------------------------------------------------

function runRefresh(): Promise<void> {
  inflight = refreshCelo()
    .then(() => {
      lastRefresh = Date.now();
    })
    .catch((e) => console.warn("[leaderboard] refresh failed:", (e as Error).message))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Cold start blocks until the first scan completes (nothing to serve yet). After that it's
 * stale-while-revalidate: stale data is served immediately and a background refresh is kicked off,
 * so no request ever eats the scan latency once the index exists.
 */
async function ensureFresh(): Promise<void> {
  if (lastRefresh === 0) {
    return inflight ?? runRefresh();
  }
  if (Date.now() - lastRefresh >= REFRESH_TTL_MS && !inflight) {
    void runRefresh(); // fire-and-forget; serve current data now
  }
}

/** Exported alias used by tournament.ts — same semantics. */
export const ensureLeaderboardFresh = ensureFresh;

/** Returns all player aggregates for tournament eligibility calculations. */
export function getPlayerAggregates(): PlayerAgg[] {
  return Array.from(players.values());
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface PlayerStats {
  address: string;
  chain: "celo";
  unit: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalStaked: number;
  totalWinnings: number;
  totalLost: number;
  netProfit: number;
  highestMultiplierBp: number;
  currentStreak: number;
  longestStreak: number;
}

function cutoffBlock(chain: "celo", period: Period): number {
  if (period === "allTime") return -Infinity;
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  return celoHead - days * CELO_BLOCKS_PER_DAY;
}

function buildStats(p: PlayerAgg, games: GameRecord[]): PlayerStats {
  let gamesWon = 0;
  let totalStaked = 0;
  let totalWinnings = 0;
  let totalLost = 0;
  let highestMultiplierBp = 0;
  for (const g of games) {
    if (g.won) gamesWon++;
    totalStaked += g.stake;
    totalWinnings += g.payout;
    if (g.payout < g.stake) totalLost += g.stake - g.payout;
    if (g.multiplierBp > highestMultiplierBp) highestMultiplierBp = g.multiplierBp;
  }
  let longestStreak = 0;
  let run = 0;
  for (const g of games) {
    if (g.won) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else run = 0;
  }
  let currentStreak = 0;
  for (let i = games.length - 1; i >= 0; i--) {
    if (games[i].won) currentStreak++;
    else break;
  }
  const gamesPlayed = games.length;
  return {
    address: p.address,
    chain: p.chain,
    unit: p.unit,
    gamesPlayed,
    gamesWon,
    winRate: gamesPlayed ? Math.round((gamesWon / gamesPlayed) * 100) : 0,
    totalStaked: round2(totalStaked),
    totalWinnings: round2(totalWinnings),
    totalLost: round2(totalLost),
    netProfit: round2(totalWinnings - totalStaked),
    highestMultiplierBp,
    currentStreak,
    longestStreak,
  };
}

function metricValue(s: PlayerStats, metric: Metric): number {
  switch (metric) {
    case "winnings":
      return s.totalWinnings;
    case "winRate":
      return s.winRate;
    case "gamesPlayed":
      return s.gamesPlayed;
    case "highestMultiplier":
      return s.highestMultiplierBp;
  }
}

function deriveAchievements(s: PlayerStats): string[] {
  const a: string[] = [];
  if (s.gamesWon >= 1) a.push("first_win");
  if (s.longestStreak >= 5) a.push("streak_5");
  if (s.highestMultiplierBp >= 15000) a.push("high_roller");
  if (s.gamesPlayed >= 50) a.push("veteran");
  if (s.netProfit > 0) a.push("in_profit");
  return a;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string | null;
  avatar: string | null;
  unit: string;
  score: number;
  gamesPlayed: number;
  winRate: number;
  totalWinnings: number;
  highestMultiplierBp: number;
}

export async function getLeaderboard(
  period: Period,
  metric: Metric,
  viewer?: string
): Promise<{ leaderboard: LeaderboardEntry[]; userRank: number | null }> {
  await ensureFresh();

  const stats: PlayerStats[] = [];
  for (const p of players.values()) {
    const games =
      period === "allTime" ? p.games : p.games.filter((g) => g.block >= cutoffBlock(p.chain, period));
    if (!games.length) continue;
    stats.push(buildStats(p, games));
  }

  stats.sort((a, b) => {
    const d = metricValue(b, metric) - metricValue(a, metric);
    return d !== 0 ? d : b.gamesPlayed - a.gamesPlayed; // tie-break by volume
  });

  const leaderboard: LeaderboardEntry[] = stats.map((s, i) => {
    const overlay = getProfileOverlay(s.address);
    return {
      rank: i + 1,
      address: s.address,
      username: overlay?.username ?? null,
      avatar: overlay?.avatar ?? null,
      unit: s.unit,
      score: metricValue(s, metric),
      gamesPlayed: s.gamesPlayed,
      winRate: s.winRate,
      totalWinnings: s.totalWinnings,
      highestMultiplierBp: s.highestMultiplierBp,
    };
  });

  let userRank: number | null = null;
  if (viewer) {
    const key = normalizeAddr(viewer);
    const me = leaderboard.find((e) => normalizeAddr(e.address) === key);
    userRank = me ? me.rank : null;
  }

  return { leaderboard, userRank };
}

export interface PlayerProfile {
  address: string;
  username: string | null;
  avatar: string | null;
  unit: string;
  stats: {
    totalGamesPlayed: number;
    totalGamesWon: number;
    totalStaked: number;
    totalWinnings: number;
    totalLosses: number;
    highestMultiplier: number; // bps; the UI divides by 10000
    currentStreak: number;
    longestStreak: number;
    favoriteGame: string | null;
  };
  achievements: string[];
  recentGames: { multiplierBp: number; payout: number; won: boolean; block: number }[];
}

export async function getPlayerProfile(address: string): Promise<PlayerProfile> {
  await ensureFresh();
  const key = normalizeAddr(address);
  const p = players.get(key);
  const onChainGames = p?.games ?? [];
  const stub: PlayerAgg = p ?? {
    address: key,
    chain: "celo",
    unit: "USDm",
    games: [],
  };

  // Supplement with server-side game history for sessions not yet indexed on-chain.
  const historyGames = getPlayerHistory(address);
  const supplemental: GameRecord[] = historyGames
    .filter((h) => !seenSettled.has(`${h.chain}:${h.sessionId}`))
    .map((h) => ({
      block: 0,
      approxTs: h.approxTs ?? Date.now(),
      stake: h.stake,
      payout: h.payout,
      multiplierBp: h.multiplierBp,
      won: h.won,
      difficulty: h.difficulty ?? Math.min(1, h.stake),
    }));
  const games = supplemental.length ? [...onChainGames, ...supplemental] : onChainGames;

  const s = buildStats(stub, games);
  const overlay = getProfileOverlay(key);

  return {
    address,
    username: overlay?.username ?? null,
    avatar: overlay?.avatar ?? null,
    unit: stub.unit,
    stats: {
      totalGamesPlayed: s.gamesPlayed,
      totalGamesWon: s.gamesWon,
      totalStaked: s.totalStaked,
      totalWinnings: s.totalWinnings,
      totalLosses: s.totalLost,
      highestMultiplier: s.highestMultiplierBp,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      favoriteGame: null,
    },
    achievements: deriveAchievements(s),
    recentGames: games
      .slice(-10)
      .reverse()
      .map((g) => ({
        multiplierBp: g.multiplierBp,
        payout: round2(g.payout),
        won: g.won,
        block: g.block,
      })),
  };
}

// ---------------------------------------------------------------------------
// Platform analytics
//
// The analytics dashboard is single-unit (USDm), covering all three token types (USDm, USDC, USDT)
// since all are ~$1 and all come from the same contract. Amounts are summed in human units (decimals
// already converted). Timestamps are approximated from block height. "Popular games" is empty because
// the game module isn't recorded on-chain.
// ---------------------------------------------------------------------------

export type AnalyticsRange = "24h" | "7d" | "30d" | "all";

export interface Analytics {
  totalUsers: number;
  totalGames: number;
  totalVolume: number; // USDm
  totalPayout: number; // USDm
  activeUsers24h: number;
  activeUsers7d: number;
  popularGames: { id: string; name: string; plays: number }[];
  recentActivity: { type: "win" | "loss"; player: string; amount: number; timestamp: number }[];
  volumeChart: { date: string; volume: number }[];
}

/** Approximate wall-clock time of a Celo block from its height (avoids a getBlock per record). */
function approxCeloTime(block: number): number {
  const daysAgo = (celoHead - block) / CELO_BLOCKS_PER_DAY;
  return Date.now() - Math.max(0, daysAgo) * 86_400_000;
}

function buildVolumeChart(
  games: { block: number; stake: number }[],
  startBlock: number
): { date: string; volume: number }[] {
  const BUCKETS = 7;
  const end = celoHead;
  // allCeloGames is sorted descending by block (most-recent first); last element is the earliest.
  const start = startBlock === -Infinity ? (games.length ? games[games.length - 1].block : end) : Math.max(0, startBlock);
  const span = Math.max(1, end - start);
  const step = span / BUCKETS;
  const vols = new Array(BUCKETS).fill(0);
  for (const g of games) {
    if (g.block < start) continue;
    const i = Math.min(BUCKETS - 1, Math.max(0, Math.floor((g.block - start) / step)));
    vols[i] += g.stake;
  }
  return vols.map((volume, i) => {
    const bucketEnd = start + step * (i + 1);
    const daysAgo = (end - bucketEnd) / CELO_BLOCKS_PER_DAY;
    const date = new Date(Date.now() - Math.max(0, daysAgo) * 86_400_000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return { date, volume: round2(volume) };
  });
}

export async function getAnalytics(range: AnalyticsRange): Promise<Analytics> {
  await ensureFresh();

  const days = range === "24h" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : Infinity;
  const cutoff = days === Infinity ? -Infinity : celoHead - days * CELO_BLOCKS_PER_DAY;
  const cut24 = celoHead - CELO_BLOCKS_PER_DAY;
  const cut7 = celoHead - 7 * CELO_BLOCKS_PER_DAY;

  let totalGames = 0;
  let totalVolume = 0;
  let totalPayout = 0;
  const usersInRange = new Set<string>();
  const active24 = new Set<string>();
  const active7 = new Set<string>();
  const allCeloGames: { block: number; stake: number; payout: number; won: boolean; player: string }[] = [];

  for (const p of players.values()) {
    for (const g of p.games) {
      allCeloGames.push({ block: g.block, stake: g.stake, payout: g.payout, won: g.won, player: p.address });
      if (g.block >= cut24) active24.add(p.address);
      if (g.block >= cut7) active7.add(p.address);
      if (g.block >= cutoff) {
        totalGames++;
        totalVolume += g.stake;
        totalPayout += g.payout;
        usersInRange.add(p.address);
      }
    }
  }

  allCeloGames.sort((a, b) => b.block - a.block);
  const recentActivity = allCeloGames.slice(0, 12).map((g) => ({
    type: (g.won ? "win" : "loss") as "win" | "loss",
    player: g.player,
    amount: round2(g.payout),
    timestamp: approxCeloTime(g.block),
  }));

  return {
    totalUsers: usersInRange.size,
    totalGames,
    totalVolume: round2(totalVolume),
    totalPayout: round2(totalPayout),
    activeUsers24h: active24.size,
    activeUsers7d: active7.size,
    popularGames: [], // not derivable on-chain
    recentActivity,
    volumeChart: buildVolumeChart(allCeloGames, cutoff),
  };
}
