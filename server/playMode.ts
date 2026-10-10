// server/playMode.ts — the single global play-mode switch.
//
// Arcadia has two mechanics:
//   - "stake" — the paid game: on-chain staking, EIP-712 settlement, token payouts (v2 multi-token).
//                This is the full v1/v2 money path and it is PRESERVED, not removed.
//   - "free"  — stakeless play: no on-chain tx, no payout. Completing a game awards Arcade XP
//                (see server/points.ts). Used while the treasury is dry.
//
// The switch is an env var so flipping the whole platform (backend + frontend, via /api/config) is a
// one-line redeploy with no code change. It defaults to "free": with the treasury empty, the safe
// default is the mode that can never owe a payout. Set PLAY_MODE=stake to bring the paid game back.

export type PlayMode = "free" | "stake";

export function playMode(): PlayMode {
  // Only the exact string "stake" turns on the paid path; anything else (unset, typo, "free") is free.
  // Fail-safe toward free so a misconfig can never silently re-enable real-money payouts.
  return process.env.PLAY_MODE === "stake" ? "stake" : "free";
}

export function isFreeMode(): boolean {
  return playMode() === "free";
}

export function isStakeMode(): boolean {
  return playMode() === "stake";
}
