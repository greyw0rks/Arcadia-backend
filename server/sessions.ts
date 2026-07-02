// Copyright (c) 2024–2025 greyw0rks. All rights reserved.
// Proprietary and confidential. Unauthorised copying or redistribution is prohibited.
// See LICENSE in the repository root for full terms.

// In-memory session store. Authoritative game state lives here, NOT in the client. Holds the answer
// keys, the running multiplier, and per-round deadlines. NOTE: resets on server restart — fine for the
// MVP/demo; swap for Redis/SQLite for production (see README).

import { randomBytes } from "crypto";
import { GameModule } from "./games/types";
import { RoundState } from "./games/types";
import { initialMultiplierBp, applyResult, clampFinalBp } from "./engine";
import { ANSWER_GRACE_MS } from "./config";
import { scaleTimer } from "./difficulty";
import { DEFAULT_CELO_TOKEN, type CeloToken } from "../lib/contract";

export type ChainId = "celo" | "base" | "stacks";

export interface Session {
  id: `0x${string}`; // bytes32 / (buff 32), also the on-chain sessionId
  gameId: string;
  chain: ChainId; // which network the stake + settlement live on
  // Which Celo stake token (cUSD/USDC/USDT) — i.e. which QuizArcade instance. Only meaningful when
  // chain === "celo"; it selects the EIP-712 verifyingContract and the funding-gate contract to read.
  token?: CeloToken;
  player: string; // wallet address/principal that will stake (lowercased for EVM only)
  // Free one-per-wallet trial: no stake, no on-chain tx, no payout. The funding gate and settlement
  // are skipped for these (see /api/round and /api/finalize).
  isDemo: boolean;
  stake?: number; // gross stake amount in token units (undefined for demo sessions)
  maxRounds: number;
  // Bet-scaled difficulty in [0,1] (0 == min stake, 1 == max stake). Set from the REAL on-chain stake
  // when the first round is served (see /api/round). Until then it's undefined and rounds aren't built.
  difficulty?: number;
  roundIndex: number; // next round to serve (0-based)
  multiplierBp: number;
  current?: RoundState; // the round currently in flight (with answer key + deadline)
  answered: number; // rounds scored so far
  finalized: boolean;
  createdAt: number;
}

const SESSIONS = new Map<string, Session>();

// Wallets that have already consumed their one free demo. NOTE: in-memory, so it resets on server
// restart — consistent with the session store above. Swap for the same persistent store in production.
const USED_DEMO = new Set<string>();

/** Normalize a player id for demo-usage lookups (EVM is case-insensitive; Stacks is not). */
function demoKey(player: string, chain: ChainId): string {
  const p = chain !== "stacks" ? player.toLowerCase() : player;
  return `${chain}:${p}`;
}

/** Has this wallet already used its one-time demo play? */
export function hasUsedDemo(player: string, chain: ChainId): boolean {
  return USED_DEMO.has(demoKey(player, chain));
}

/** Record that this wallet has consumed its one-time demo play. */
export function markDemoUsed(player: string, chain: ChainId): void {
  USED_DEMO.add(demoKey(player, chain));
}

/** 32-byte hex id usable directly as the contract's bytes32 sessionId. */
function newSessionId(): `0x${string}` {
  return ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
}

export function createSession(
  game: GameModule,
  player: string,
  maxRounds: number,
  chain: ChainId,
  token?: CeloToken,
  opts?: { isDemo?: boolean; difficulty?: number; stake?: number }
): Session {
  const id = newSessionId();
  const s: Session = {
    id,
    gameId: game.id,
    chain,
    // The stake token is a Celo-only routing dimension; default cUSD for back-compat. Left undefined
    // for Stacks (STX has no token sub-dimension).
    token: chain === "celo" ? token ?? DEFAULT_CELO_TOKEN : undefined,
    // EVM addresses are case-insensitive; Stacks principals are case-sensitive (c32check) — keep as-is.
    player: chain !== "stacks" ? player.toLowerCase() : player,
    isDemo: opts?.isDemo ?? false,
    stake: opts?.stake,
    // Demo sessions skip the on-chain reconcile, so their difficulty is fixed up front.
    difficulty: opts?.difficulty,
    maxRounds,
    roundIndex: 0,
    multiplierBp: initialMultiplierBp(),
    answered: 0,
    finalized: false,
    createdAt: Date.now(),
  };
  SESSIONS.set(id, s);
  return s;
}

export function getSession(id: string): Session | undefined {
  return SESSIONS.get(id);
}

/** Stable 31-bit seed derived from a session id, so each session gets its own round ordering. */
function sessionSeed(id: string): number {
  let h = 0;
  for (let i = 2; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  }
  return h || 1;
}

/** Serve the next round: builds it from the module and stamps the authoritative deadline. */
export function nextRound(game: GameModule, s: Session) {
  if (s.roundIndex >= s.maxRounds) return null;
  const difficulty = s.difficulty ?? 0;
  const round = game.buildRound(s.roundIndex, sessionSeed(s.id), difficulty);
  // Bet-scaled difficulty: shrink the per-round timer as the stake rises, and report the session's
  // actual (stake-driven) round count rather than the module's base value.
  round.view.timeLimitSec = scaleTimer(round.view.timeLimitSec, difficulty);
  round.view.totalRounds = s.maxRounds;
  round.deadline = Date.now() + round.view.timeLimitSec * 1000 + ANSWER_GRACE_MS;
  s.current = round;
  // Strip the answer key before returning to the caller/route.
  return round.view;
}

export type AnswerOutcome = {
  result: "correct" | "wrong";
  correctIndex: number; // safe to reveal: the round is over once scored
  multiplierBp: number;
  roundsLeft: number;
  done: boolean;
};

/** Score the player's answer for the in-flight round. Timeouts / late answers are scored wrong. */
export function scoreAnswer(s: Session, answerIndex: number): AnswerOutcome | null {
  const round = s.current;
  if (!round) return null;

  const onTime = Date.now() <= round.deadline;
  const result: "correct" | "wrong" =
    onTime && answerIndex === round.correctIndex ? "correct" : "wrong";
  const correctIndex = round.correctIndex;

  s.multiplierBp = applyResult(s.multiplierBp, result);
  s.answered += 1;
  s.roundIndex += 1;
  s.current = undefined;

  const roundsLeft = s.maxRounds - s.answered;
  return { result, correctIndex, multiplierBp: s.multiplierBp, roundsLeft, done: roundsLeft <= 0 };
}

/** Final clamped multiplier (bps) for settlement. */
export function finalMultiplierBp(s: Session): number {
  return clampFinalBp(s.multiplierBp, s.maxRounds);
}
