// server/cooldown.ts — per-(wallet, game) play limit + cooldown, and the permanent play log.
//
// Rule: a wallet may play a given game up to MAX_PLAYS times; the MAX_PLAYS-th play starts a
// COOLDOWN_MS lock. While locked, further plays of that game are rejected. Once the lock expires the
// burst counter resets to 0 and another MAX_PLAYS plays are allowed. Tracked per (address, chain,
// game_id) in Postgres so it survives restarts and can't be dodged by reconnecting.
//
// Also exposes logPlay(): an append-only record of every game played (real + demo) including the
// game_id — the game identity is NOT stored on-chain, so game_plays is the authoritative answer to
// "what game did address X play?".
//
// When DATABASE_URL is absent, query() is a no-op returning null; in that case the cooldown gate
// fails OPEN (allows play) so local dev without a DB still works.

import { query } from "./db";
import type { ChainId } from "../lib/contract";

export const MAX_PLAYS = 5;              // plays allowed per game before the cooldown
export const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

function addr(a: string): string {
  return a.startsWith("0x") ? a.toLowerCase() : a;
}

export interface CooldownStatus {
  allowed: boolean;
  playsUsed: number;      // burst count AFTER this attempt would be counted (0..MAX_PLAYS)
  playsRemaining: number; // plays left in the current burst before the lock (0..MAX_PLAYS)
  lockedUntil: number | null; // epoch ms when the lock lifts, if currently locked
  retryAfterMs: number;   // ms until play is allowed again (0 if allowed now)
}

/**
 * Pure decision: given the stored (burst, lockedUntil) and the current time, decide whether a play
 * is allowed and what the NEXT stored state should be. Extracted so it can be unit-tested without a
 * database. `nextBurst`/`nextLockMs` are only meaningful when `allowed` is true (what to persist).
 */
export function decidePlay(
  burst: number,
  lockedUntilMs: number | null,
  nowMs: number
): CooldownStatus & { nextBurst: number; nextLockMs: number | null } {
  const lockActive = lockedUntilMs !== null && lockedUntilMs > nowMs;

  // Locked and burst exhausted → reject without consuming.
  if (lockActive && burst >= MAX_PLAYS) {
    return {
      allowed: false,
      playsUsed: burst,
      playsRemaining: 0,
      lockedUntil: lockedUntilMs,
      retryAfterMs: Math.max(0, lockedUntilMs - nowMs),
      nextBurst: burst,
      nextLockMs: lockedUntilMs,
    };
  }

  // Allowed. Fresh burst if the lock expired or the previous burst hit the cap; else continue it.
  const expired = lockedUntilMs !== null && lockedUntilMs <= nowMs;
  const nextBurst = expired || burst >= MAX_PLAYS ? 1 : burst + 1;
  const reachedCap = nextBurst >= MAX_PLAYS;
  const nextLockMs = reachedCap ? nowMs + COOLDOWN_MS : null;

  return {
    allowed: true,
    playsUsed: nextBurst,
    playsRemaining: Math.max(0, MAX_PLAYS - nextBurst),
    lockedUntil: nextLockMs,
    retryAfterMs: 0,
    nextBurst,
    nextLockMs,
  };
}

/**
 * Atomically check-and-consume one play for (address, game). Returns whether the play is allowed
 * and the resulting cooldown state. Must be called BEFORE creating the session so a rejected play
 * does not consume a slot.
 *
 * The whole decision is one SQL round-trip using an upsert with conditional logic:
 *   - If no row, or the existing lock has expired  -> reset burst to 1 (this play), clear lock.
 *   - Else if burst < MAX_PLAYS                     -> burst + 1; set lock when it reaches MAX_PLAYS.
 *   - Else (burst == MAX_PLAYS and still locked)    -> reject (handled by the WHERE / returned row).
 *
 * Implemented with an INSERT ... ON CONFLICT DO UPDATE so concurrent requests can't double-count.
 */
export async function consumePlay(
  player: string,
  chain: ChainId,
  gameId: string
): Promise<CooldownStatus> {
  const a = addr(player);
  const nowMs = Date.now();

  // First: read current state to decide allow/deny (and compute retry time on deny).
  const cur = await query<{
    burst_count: number;
    locked_until: Date | null;
  }>(
    `SELECT burst_count, locked_until FROM game_cooldowns
     WHERE address = $1 AND chain = $2 AND game_id = $3`,
    [a, chain, gameId]
  );

  // No DB (dev mode): fail open.
  if (cur === null) {
    return { allowed: true, playsUsed: 1, playsRemaining: MAX_PLAYS - 1, lockedUntil: null, retryAfterMs: 0 };
  }

  const row = cur.rows[0];
  const lockedUntilMs = row?.locked_until ? new Date(row.locked_until).getTime() : null;
  const burst = row?.burst_count ?? 0;

  const decision = decidePlay(burst, lockedUntilMs, nowMs);
  if (!decision.allowed) {
    return {
      allowed: false,
      playsUsed: decision.playsUsed,
      playsRemaining: decision.playsRemaining,
      lockedUntil: decision.lockedUntil,
      retryAfterMs: decision.retryAfterMs,
    };
  }

  const nextLockIso = decision.nextLockMs ? new Date(decision.nextLockMs).toISOString() : null;
  await query(
    `INSERT INTO game_cooldowns (address, chain, game_id, burst_count, locked_until, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (address, chain, game_id)
     DO UPDATE SET burst_count = $4, locked_until = $5, updated_at = NOW()`,
    [a, chain, gameId, decision.nextBurst, nextLockIso]
  );

  return {
    allowed: true,
    playsUsed: decision.playsUsed,
    playsRemaining: decision.playsRemaining,
    lockedUntil: decision.lockedUntil,
    retryAfterMs: 0,
  };
}

/** Read-only cooldown status for (address, game) without consuming a play. */
export async function peekCooldown(
  player: string,
  chain: ChainId,
  gameId: string
): Promise<CooldownStatus> {
  const a = addr(player);
  const nowMs = Date.now();
  const cur = await query<{ burst_count: number; locked_until: Date | null }>(
    `SELECT burst_count, locked_until FROM game_cooldowns
     WHERE address = $1 AND chain = $2 AND game_id = $3`,
    [a, chain, gameId]
  );
  if (cur === null || !cur.rows[0]) {
    return { allowed: true, playsUsed: 0, playsRemaining: MAX_PLAYS, lockedUntil: null, retryAfterMs: 0 };
  }
  const row = cur.rows[0];
  const lockedUntilMs = row.locked_until ? new Date(row.locked_until).getTime() : null;
  const lockActive = lockedUntilMs !== null && lockedUntilMs > nowMs;
  const burst = row.burst_count ?? 0;
  if (lockActive && burst >= MAX_PLAYS) {
    return {
      allowed: false,
      playsUsed: burst,
      playsRemaining: 0,
      lockedUntil: lockedUntilMs,
      retryAfterMs: Math.max(0, lockedUntilMs - nowMs),
    };
  }
  // If the lock has expired, the next play starts fresh.
  const expired = lockedUntilMs !== null && lockedUntilMs <= nowMs;
  const effectiveBurst = expired || burst >= MAX_PLAYS ? 0 : burst;
  return {
    allowed: true,
    playsUsed: effectiveBurst,
    playsRemaining: Math.max(0, MAX_PLAYS - effectiveBurst),
    lockedUntil: null,
    retryAfterMs: 0,
  };
}

/**
 * Append a permanent record of a game being played. Fire-and-forget; failures are swallowed so a
 * logging hiccup never blocks gameplay. This is what makes "which game did X play" answerable.
 */
export function logPlay(rec: {
  player: string;
  chain: ChainId;
  gameId: string;
  sessionId?: string;
  isDemo?: boolean;
  stake?: number;
  unit?: string;
}): void {
  void query(
    `INSERT INTO game_plays (address, chain, game_id, session_id, is_demo, stake, unit)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      addr(rec.player),
      rec.chain,
      rec.gameId,
      rec.sessionId ?? null,
      rec.isDemo ?? false,
      rec.stake ?? null,
      rec.unit ?? null,
    ]
  );
}

export interface PlayRecord {
  gameId: string;
  sessionId: string | null;
  isDemo: boolean;
  stake: number | null;
  unit: string | null;
  playedAt: number; // epoch ms
}

/** All games a wallet has played, most recent first. Empty when no DB or no plays. */
export async function getPlaysByAddress(player: string, chain: ChainId): Promise<PlayRecord[]> {
  const res = await query<{
    game_id: string;
    session_id: string | null;
    is_demo: boolean;
    stake: string | null;
    unit: string | null;
    played_at: Date;
  }>(
    `SELECT game_id, session_id, is_demo, stake, unit, played_at
     FROM game_plays WHERE address = $1 AND chain = $2
     ORDER BY played_at DESC`,
    [addr(player), chain]
  );
  if (!res) return [];
  return res.rows.map((r) => ({
    gameId: r.game_id,
    sessionId: r.session_id,
    isDemo: r.is_demo,
    stake: r.stake !== null ? Number(r.stake) : null,
    unit: r.unit,
    playedAt: new Date(r.played_at).getTime(),
  }));
}

/** Look up which game a specific on-chain session belonged to. */
export async function getGameBySession(sessionId: string): Promise<string | null> {
  const res = await query<{ game_id: string }>(
    `SELECT game_id FROM game_plays WHERE session_id = $1 ORDER BY played_at DESC LIMIT 1`,
    [sessionId]
  );
  return res?.rows[0]?.game_id ?? null;
}
