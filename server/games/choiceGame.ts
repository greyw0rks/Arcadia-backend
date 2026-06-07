import { GameModule, RoundState } from "./types";

// Shared scaffolding for any multiple-choice game. A game supplies metadata + a `build(roundIndex)`
// that returns a prompt, the correct option, and the full option list; the factory handles the
// server-side shuffle, correct-index bookkeeping, and RoundView shape. Adding a choice game is then
// just a question bank + a few lines.

export interface ChoiceRound {
  prompt: string;
  imageUrl?: string;
  correct: string; // must also appear in `options`
  options: string[];
}

export interface ChoiceMeta {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  maxRounds: number;
  timeLimitSec: number;
  bankSize: number; // unique questions available; caps stake-driven rounds so a session never repeats
}

// Seeded shuffle: the client must not be able to derive the answer ordering, but the server does not
// need cryptographic randomness here.
export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Per-session entry picker. Builds a seeded permutation of the bank's indices and indexes into it
 * by round, so a single session never repeats an entry until the bank is exhausted (bank >=
 * maxRounds) and different sessions (different seeds) get different orderings.
 *
 * Replaces the old `(roundIndex * stride + now) % len` picker, which repeated within a session
 * whenever the stride shared a factor with the bank size (e.g. stride 3 over a 9-entry bank showed
 * only 3 distinct entries across 5 rounds) and showed every concurrent player the same handful of
 * entries.
 */
export function pickIndex(bankLength: number, roundIndex: number, seed: number): number {
  const order = shuffle(
    Array.from({ length: bankLength }, (_, i) => i),
    seed
  );
  return order[roundIndex % bankLength];
}

export function makeChoiceGame(
  meta: ChoiceMeta,
  build: (roundIndex: number, seed: number, difficulty?: number) => ChoiceRound
): GameModule {
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    thumbnail: meta.thumbnail,
    maxRounds: meta.maxRounds,
    bankSize: meta.bankSize,
    available: true,
    buildRound(roundIndex: number, seed: number, difficulty?: number): RoundState {
      const r = build(roundIndex, seed, difficulty);
      // Fold the session seed into the option shuffle too, so answer ordering isn't identical
      // across every session for a given round.
      const options = shuffle(r.options, seed + roundIndex + 1);
      const correctIndex = options.indexOf(r.correct);
      return {
        view: {
          roundIndex,
          totalRounds: meta.maxRounds,
          prompt: r.prompt,
          imageUrl: r.imageUrl,
          options,
          timeLimitSec: meta.timeLimitSec,
        },
        correctIndex,
        deadline: 0, // stamped by the session manager when served
      };
    },
  };
}
