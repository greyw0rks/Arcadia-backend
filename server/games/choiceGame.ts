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
//
// Uses mulberry32 to derive each swap index from the HIGH bits of the PRNG state. The previous
// implementation took `(lcg & 0x7fffffff) % (i + 1)`, which reads the LOW bits of a power-of-two-
// masked LCG — those bits barely change between iterations, so a 4-option shuffle placed the answer
// at index 3 ~99% of the time. mulberry32's output is well-distributed across the full 32-bit range.
export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = (seed || 1) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    // mulberry32 step
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const rand = ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0,1)
    const j = Math.floor(rand * (i + 1));
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

// Per-difficulty-level tier recipes (7 entries = one MIN_ROUNDS cycle).
// Each session block of 7 rounds is an independently shuffled copy, so the harder questions
// don't always land in the same positions. Counts per block:
//   easy:      3×easy, 2×medium, 1×hard, 1×extreme
//   hard:      1×easy, 2×medium, 3×hard, 1×extreme
//   very hard: 0×easy, 1×medium, 3×hard, 3×extreme
//   extreme:   0×easy, 0×medium, 1×hard, 6×extreme
const TIER_RECIPES: readonly number[][] = [
  [0, 0, 0, 1, 1, 2, 3], // easy      (d < 1/4)
  [0, 1, 1, 2, 2, 2, 3], // hard      (1/4 ≤ d < 1/2)
  [1, 2, 2, 2, 3, 3, 3], // very hard (1/2 ≤ d < 3/4)
  [2, 3, 3, 3, 3, 3, 3], // extreme   (d ≥ 3/4)
];

function diffLevel(d: number): number {
  if (d < 0.25) return 0;
  if (d < 0.5) return 1;
  if (d < 0.75) return 2;
  return 3;
}

// Builds a 20-slot tier schedule for a session. Each block of recipe.length slots is an
// independently shuffled copy of the recipe — exact distribution per block, varied order.
function buildSchedule(seed: number, difficulty: number): number[] {
  const recipe = TIER_RECIPES[diffLevel(difficulty)];
  const schedule: number[] = [];
  let block = 0;
  while (schedule.length < 20) {
    schedule.push(...shuffle([...recipe], seed ^ (0xf00d + block)));
    block++;
  }
  return schedule.slice(0, 20);
}

// Returns tiers in ascending distance from `target` so fallback expands outward.
function tiersNearTarget(target: number): number[] {
  return [0, 1, 2, 3].sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
}

/**
 * Tier-aware, no-repeat picker with a shuffled difficulty-based mix.
 *
 * Builds a per-session tier schedule (recipe shuffled per 7-round block) then simulates
 * rounds 0..roundIndex to track what has been drawn. Each round picks the nearest available
 * bank entry for the scheduled tier; exhausted tiers fall back to adjacent ones automatically.
 * No entry repeats while roundIndex < bankLength.
 */
export function tieredPickIndex(
  tiers: number[],
  roundIndex: number,
  seed: number,
  difficulty = 0
): number {
  // Sort shuffled bank indices into per-tier buckets for O(1) lookup.
  const buckets: number[][] = [[], [], [], []];
  for (const idx of shuffle(Array.from({ length: tiers.length }, (_, i) => i), seed)) {
    buckets[Math.min(3, Math.max(0, tiers[idx] ?? 1))].push(idx);
  }

  const schedule = buildSchedule(seed, difficulty);
  const used = new Set<number>();

  function pickFor(targetTier: number): number {
    for (const t of tiersNearTarget(targetTier)) {
      for (const idx of buckets[t]) {
        if (!used.has(idx)) { used.add(idx); return idx; }
      }
    }
    // Total bank exhausted (session longer than bank — shouldn't occur with valid config)
    for (let i = 0; i < tiers.length; i++) {
      if (!used.has(i)) { used.add(i); return i; }
    }
    return roundIndex % tiers.length;
  }

  let result = 0;
  for (let r = 0; r <= roundIndex; r++) {
    result = pickFor(schedule[r]);
  }
  return result;
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
