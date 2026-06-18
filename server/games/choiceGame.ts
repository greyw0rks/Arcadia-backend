import { GameModule, RoundState } from "./types";

// Shared scaffolding for any multiple-choice game. A game supplies metadata + a `build(roundIndex)`
// that returns a prompt, the correct option, and the full option list; the factory handles the
// server-side shuffle, correct-index bookkeeping, and RoundView shape. Adding a choice game is then
// just a question bank + a few lines.

export interface ChoiceRound {
  prompt: string;
  imageUrl?: string;
  imageStyle?: 'hard' | 'extreme'; // visual treatment; absent = full colour
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

// Difficulty tiers a bank entry can carry. Absent => "medium".
export type Tier = "easy" | "medium" | "hard" | "extreme";
export function tierNum(t?: Tier): number {
  if (t === "extreme") return 3;
  if (t === "hard") return 2;
  if (t === "easy") return 0;
  return 1; // medium or untagged
}

/** Target tier — always extreme. Sessions draw extreme→hard→medium→easy order. */
function targetTier(_difficulty: number): number {
  return 3;
}

/**
 * Tier-aware sibling of `pickIndex`. Builds a full no-repeat permutation of the bank, FRONT-LOADED by
 * the tier matching `difficulty`: a low bet sees easy entries first, a max bet sees hard ones first,
 * and longer sessions bleed into adjacent tiers. Because the result is still a permutation of the
 * whole bank, a session never repeats an entry while roundIndex < bankLength — same guarantee as
 * pickIndex. `tiers[i]` is entry i's tier number (see tierNum); missing/medium entries sort to the
 * middle, so partially-tagged banks still behave (hard entries lead at high bets).
 */
export function tieredPickIndex(
  tiers: number[],
  roundIndex: number,
  seed: number,
  difficulty = 0
): number {
  const target = targetTier(difficulty);
  // Seeded base order first, then a STABLE sort by distance from the target tier. V8's Array.sort is
  // stable, so the seeded variety is preserved within each tier — no fixed ordering across sessions.
  const order = shuffle(
    Array.from({ length: tiers.length }, (_, i) => i),
    seed
  );
  order.sort((a, b) => Math.abs((tiers[a] ?? 1) - target) - Math.abs((tiers[b] ?? 1) - target));
  return order[roundIndex % tiers.length];
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
          imageStyle: r.imageStyle,
          options,
          timeLimitSec: meta.timeLimitSec,
        },
        correctIndex,
        deadline: 0, // stamped by the session manager when served
      };
    },
  };
}
