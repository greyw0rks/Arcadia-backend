import { makeChoiceGame } from "./choiceGame";

// Generates a fresh arithmetic problem each round (no question bank needed). Difficulty nudges up with
// the round index AND the bet: `difficulty` (0..1, from the stake) adds up to +4 tiers, so a max-bet
// session faces much larger operands. Distractors are near-misses around the true answer.
function genProblem(roundIndex: number, difficulty = 0): { prompt: string; answer: number } {
  const tier = Math.min(Math.round(Math.min(roundIndex, 6) + 3 + difficulty * 5), 12);
  const ops = ["+", "-", "×", "÷"] as const;
  const op = ops[Math.floor(Math.random() * ops.length)];
  const max = 15 + tier * 10; // 15..135
  let a = 1 + Math.floor(Math.random() * max);
  let b = 1 + Math.floor(Math.random() * max);
  let answer: number;
  if (op === "+") answer = a + b;
  else if (op === "-") {
    if (b > a) [a, b] = [b, a]; // keep it non-negative
    answer = a - b;
  } else if (op === "÷") {
    // Generate a clean division: pick b and answer, derive a
    b = 2 + Math.floor(Math.random() * (4 + tier));
    answer = 2 + Math.floor(Math.random() * (6 + tier));
    a = b * answer;
  } else {
    a = 2 + Math.floor(Math.random() * (8 + tier));
    b = 2 + Math.floor(Math.random() * (8 + tier));
    answer = a * b;
  }
  return { prompt: `${a} ${op} ${b} = ?`, answer };
}

function distractors(answer: number): string[] {
  const set = new Set<number>();
  const offsets = [1, -1, 2, -2, 3, 5, -3, 10];
  let i = 0;
  while (set.size < 3 && i < offsets.length) {
    const v = answer + offsets[i++];
    if (v !== answer && v >= 0) set.add(v);
  }
  // Pad if needed (e.g. small answers near 0).
  let pad = answer + 4;
  while (set.size < 3) {
    if (pad !== answer) set.add(pad);
    pad++;
  }
  return [...set].map(String);
}

export const mathModule = makeChoiceGame(
  {
    id: "math",
    title: "Math Sprint",
    description: "Solve the arithmetic before the timer runs out. Each correct answer is +0.1x.",
    thumbnail: "➗",
    maxRounds: 5,
    timeLimitSec: 6,
    bankSize: Number.MAX_SAFE_INTEGER, // procedural: never repeats, never caps rounds
  },
  (roundIndex, _seed, difficulty) => {
    const { prompt, answer } = genProblem(roundIndex, difficulty);
    return { prompt, correct: String(answer), options: [String(answer), ...distractors(answer)] };
  }
);
