// On-chain leaderboard / profile indexer.
//
// There is no database: the authoritative record of completed games lives in the QuizArcade
// contracts' events. This module maintains a singleton in-memory index (in the same spirit as the
// in-memory server/sessions.ts) built by scanning SessionStarted/SessionSettled on Celo (one
// QuizArcade instance per token) and the equivalent `print` events on the Stacks contract. It
// exposes aggregate queries for the leaderboard and per-player profile.
//
// Refresh is incremental (cursor per source), single-flight, and TTL-gated, so concurrent requests
// never trigger overlapping scans. The index is process-lived and rebuilt on restart.
//
// Units: Celo stake tokens are USD-stable (cUSD/USDC/USDT, all ~$1) and reported as "USDm"; Stacks
// stakes are STX. Amounts are NOT mixed under one unit — each player/entry carries its own `unit`.
// EVM addresses and Stacks principals are distinct identities, so they appear as separate rows.

import { createPublicClient, http } from "viem";
import { hexToCV, cvToJSON } from "@stacks/transactions";
import {
  celoChain,
  RPC_URL,
  CELO_TOKENS,
  STACKS_ARCADE_CONTRACT,
  STACKS_API_URL,
} from "../lib/contract";
import { ARCADE_ABI } from "../lib/abi";
import { getProfileOverlay } from "./profileStore";

export type Period = "daily" | "weekly" | "monthly" | "allTime";
export type Metric = "winnings" | "winRate" | "gamesPlayed" | "highestMultiplier";

const BPS = 10_000;
const ZERO = "0x0000000000000000000000000000000000000000";

// ---- tunables (env, all optional; sensible fallbacks) ----
const CELO_CHUNK = BigInt(process.env.CELO_LOG_CHUNK ?? "9000"); // blocks per eth_getLogs call
const CELO_LOOKBACK = BigInt(process.env.CELO_INDEX_LOOKBACK ?? "1000000"); // fallback scan window
const CELO_FROM_BLOCK = process.env.CELO_INDEX_FROM_BLOCK
  ? BigInt(process.env.CELO_INDEX_FROM_BLOCK)
  : null; // set to the deploy block for full history
const CELO_BLOCKS_PER_DAY = Number(process.env.CELO_BLOCKS_PER_DAY ?? "86400"); // ~1s L2 blocks
const STACKS_BLOCKS_PER_DAY = Number(process.env.STACKS_BLOCKS_PER_DAY ?? "144");
const STACKS_MAX_PAGES = Number(process.env.STACKS_INDEX_MAX_PAGES ?? "40"); // 50 events/page
const REFRESH_TTL_MS = Number(process.env.LEADERBOARD_TTL_MS ?? "30000");

// Server-only Hiro key (same one the /hiro proxy uses) lifts the unauthenticated per-IP rate limit.
const HIRO_HEADERS: Record<string, string> = process.env.HIRO_API_KEY
  ? { "x-api-key": process.env.HIRO_API_KEY }
  : {};

interface GameRecord {
  block: number; // EVM block number or Stacks block height (drives period filter + ordering)
  stake: number; // gross stake, human units
  payout: number; // settled payout, human units
  multiplierBp: number;
  won: boolean; // final multiplier above break-even (1.0x)
}

interface PlayerAgg {
  address: string; // lowercased EVM address or raw Stacks principal
  chain: "celo" | "stacks";
  unit: "USDm" | "STX";
  games: GameRecord[]; // chronological (ascending block)
}

interface PendingStake {
  stake: number;
  effectiveStake: number;
}

// ---- singleton index state ----
const players = new Map<string, PlayerAgg>();
const pendingStakes = new Map<string, PendingStake>(); // "<chain>:<sessionId>" -> stake from start event
const seenSettled = new Set<string>(); // "<chain>:<sessionId>" guard against double counting
const celoCursors = new Map<string, bigint>(); // arcade address -> next block to scan
const seenStacksEvents = new Set<string>(); // "<txId>:<eventIndex>"
const stacksTxBlock = new Map<string, number>(); // tx_id -> block height (immutable; cached forever)
let celoHead = 0;
let stacksHead = 0;

let lastRefresh = 0;
let inflight: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fromHuman(base: bigint, decimals: number): number {
  // Number() is safe at stablecoin/STX magnitudes; any precision loss is irrelevant for display+sort.
  return Number(base) / 10 ** decimals;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function unitOf(address: string): "USDm" | "STX" {
  return address.startsWith("0x") ? "USDm" : "STX";
}

function chainOf(address: string): "celo" | "stacks" {
  return address.startsWith("0x") ? "celo" : "stacks";
}

/** EVM addresses are case-insensitive; Stacks principals are case-sensitive — only lowercase EVM. */
function normalizeAddr(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

function getPlayer(address: string, chain: "celo" | "stacks", unit: "USDm" | "STX"): PlayerAgg {
  let p = players.get(address);
  if (!p) {
    p = { address, chain, unit, games: [] };
    players.set(address, p);
  }
  return p;
}

function recordGame(
  address: string,
  chain: "celo" | "stacks",
  unit: "USDm" | "STX",
  rec: GameRecord
): void {
  const p = getPlayer(address, chain, unit);
  p.games.push(rec);
  p.games.sort((a, b) => a.block - b.block);
}

// ---------------------------------------------------------------------------
// Celo (EVM) scan
// ---------------------------------------------------------------------------

async function refreshCelo(): Promise<void> {
  const client = createPublicClient({ chain: celoChain, transport: http(RPC_URL) });
  const head = await client.getBlockNumber();
  celoHead = Number(head);

  for (const token of Object.values(CELO_TOKENS)) {
    const arcade = token.arcadeAddress;
    if (!arcade || arcade.toLowerCase() === ZERO) continue;

    const defaultStart = CELO_FROM_BLOCK ?? (head > CELO_LOOKBACK ? head - CELO_LOOKBACK : 0n);
    let from = celoCursors.get(arcade) ?? defaultStart;

    while (from <= head) {
      const to = from + CELO_CHUNK - 1n > head ? head : from + CELO_CHUNK - 1n;
      try {
        const [started, settled] = await Promise.all([
          client.getContractEvents({
            address: arcade,
            abi: ARCADE_ABI,
            eventName: "SessionStarted",
            fromBlock: from,
            toBlock: to,
          }),
          client.getContractEvents({
            address: arcade,
            abi: ARCADE_ABI,
            eventName: "SessionSettled",
            fromBlock: from,
            toBlock: to,
          }),
        ]);

        for (const log of started) {
          const a = log.args as { sessionId: string; stake: bigint; effectiveStake: bigint };
          pendingStakes.set(`celo:${a.sessionId}`, {
            stake: fromHuman(a.stake, token.decimals),
            effectiveStake: fromHuman(a.effectiveStake, token.decimals),
          });
        }

        for (const log of settled) {
          const a = log.args as { sessionId: string; player: string; multiplierBp: bigint; payout: bigint };
          const skey = `celo:${a.sessionId}`;
          if (seenSettled.has(skey)) continue;
          seenSettled.add(skey);
          const mul = Number(a.multiplierBp);
          const payout = fromHuman(a.payout, token.decimals);
          const ps = pendingStakes.get(skey);
          // Fallback when the start event predates our scan window: reconstruct the effective stake
          // from payout / multiplier (gross stake ≈ effective; the rake difference is negligible here).
          const stake = ps?.stake ?? (mul > 0 ? (payout * BPS) / mul : payout);
          recordGame(a.player.toLowerCase(), "celo", "USDm", {
            block: Number(log.blockNumber),
            stake,
            payout,
            multiplierBp: mul,
            won: mul > BPS,
          });
        }

        celoCursors.set(arcade, to + 1n);
        from = to + 1n;
      } catch (e) {
        // Provider hiccup / range too large: persist the cursor and resume here on the next refresh.
        console.warn(
          `[leaderboard] celo scan ${arcade} ${from}-${to} failed: ${(e as Error).message}`
        );
        celoCursors.set(arcade, from);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stacks (Clarity) scan — `print` events over the Hiro contract-events API
// ---------------------------------------------------------------------------

async function stacksBlockHeight(base: string, txId: string): Promise<number> {
  const cached = stacksTxBlock.get(txId);
  if (cached != null) return cached;
  try {
    const r = await fetch(`${base}/extended/v1/tx/${txId}`, { headers: HIRO_HEADERS });
    if (r.ok) {
      const j = (await r.json()) as { block_height?: number };
      const h = Number(j.block_height ?? 0);
      stacksTxBlock.set(txId, h);
      return h;
    }
  } catch {
    /* ignore — height stays 0, game still counts toward all-time stats */
  }
  return 0;
}

async function refreshStacks(): Promise<void> {
  const contractId = STACKS_ARCADE_CONTRACT;
  if (!contractId || contractId.startsWith("SP000000") || contractId.startsWith("ST000000")) return;
  const base = STACKS_API_URL.replace(/\/$/, "");

  for (let pageIdx = 0; pageIdx < STACKS_MAX_PAGES; pageIdx++) {
    let results: any[];
    try {
      const r = await fetch(
        `${base}/extended/v1/contract/${contractId}/events?limit=50&offset=${pageIdx * 50}`,
        { headers: HIRO_HEADERS }
      );
      if (!r.ok) break;
      results = ((await r.json()) as { results?: any[] }).results ?? [];
    } catch (e) {
      console.warn(`[leaderboard] stacks events page ${pageIdx} failed: ${(e as Error).message}`);
      break;
    }
    if (!results.length) break;

    let hitSeen = false;
    for (const ev of results) {
      const evKey = `${ev.tx_id}:${ev.event_index}`;
      if (seenStacksEvents.has(evKey)) {
        hitSeen = true;
        continue;
      }
      seenStacksEvents.add(evKey);

      const hex: string | undefined = ev.contract_log?.value?.hex;
      if (!hex) continue; // non-print event (e.g. STX transfer)
      let v: any;
      try {
        v = (cvToJSON(hexToCV(hex)) as any).value;
      } catch {
        continue;
      }
      const event = v?.event?.value;
      if (event === "session-started") {
        const sid = v["session-id"].value;
        pendingStakes.set(`stacks:${sid}`, {
          stake: fromHuman(BigInt(v.stake.value), 6),
          effectiveStake: fromHuman(BigInt(v["effective-stake"].value), 6),
        });
      } else if (event === "session-settled") {
        const sid = v["session-id"].value;
        const skey = `stacks:${sid}`;
        if (seenSettled.has(skey)) continue;
        seenSettled.add(skey);
        const block = await stacksBlockHeight(base, ev.tx_id);
        if (block > stacksHead) stacksHead = block;
        const mul = Number(v["multiplier-bp"].value);
        const payout = fromHuman(BigInt(v.payout.value), 6);
        const ps = pendingStakes.get(skey);
        const stake = ps?.stake ?? (mul > 0 ? (payout * BPS) / mul : payout);
        recordGame(v.player.value, "stacks", "STX", {
          block,
          stake,
          payout,
          multiplierBp: mul,
          won: mul > BPS,
        });
      }
    }
    // Events page newest-first; once we reach already-seen events the rest are older/seen too.
    if (hitSeen) break;
  }
}

// ---------------------------------------------------------------------------
// Refresh orchestration (single-flight + TTL)
// ---------------------------------------------------------------------------

async function refresh(): Promise<void> {
  await Promise.allSettled([refreshCelo(), refreshStacks()]);
}

function runRefresh(): Promise<void> {
  inflight = refresh()
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

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface PlayerStats {
  address: string;
  chain: "celo" | "stacks";
  unit: "USDm" | "STX";
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

function cutoffBlock(chain: "celo" | "stacks", period: Period): number {
  if (period === "allTime") return -Infinity;
  const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
  const head = chain === "celo" ? celoHead : stacksHead;
  const perDay = chain === "celo" ? CELO_BLOCKS_PER_DAY : STACKS_BLOCKS_PER_DAY;
  return head - days * perDay;
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
  unit: "USDm" | "STX";
  score: number; // the value for the requested metric (back-compat with the page)
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
  unit: "USDm" | "STX";
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
  const games = p?.games ?? [];
  const stub: PlayerAgg = p ?? {
    address: key,
    chain: chainOf(address),
    unit: unitOf(address),
    games: [],
  };
  const s = buildStats(stub, games);
  const overlay = getProfileOverlay(key);

  return {
    address,
    username: overlay?.username ?? null,
    avatar: overlay?.avatar ?? null,
    unit: unitOf(address),
    stats: {
      totalGamesPlayed: s.gamesPlayed,
      totalGamesWon: s.gamesWon,
      totalStaked: s.totalStaked,
      totalWinnings: s.totalWinnings,
      totalLosses: s.totalLost,
      highestMultiplier: s.highestMultiplierBp,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      favoriteGame: null, // the played game module isn't recorded on-chain
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
// The analytics dashboard is single-unit (USDm), so it is scoped to Celo (the USD-stable token
// instances) for consistency — Stacks (STX) is not folded into the USDm money totals. Timestamps and
// chart dates are approximated from block height (no per-block timestamp RPC), matching the period
// filters elsewhere. "Popular games" is intentionally empty: the played game module isn't recorded
// on-chain, so it can't be derived (the page hides the section rather than show mock data).
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
  const start = startBlock === -Infinity ? (games.length ? Math.min(...games.map((g) => g.block)) : end) : Math.max(0, startBlock);
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
    if (p.chain !== "celo") continue;
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
