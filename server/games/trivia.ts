import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import { TRIVIA_TIME_LIMIT_SEC } from "../config";
import questions from "../../data/trivia.json";

interface RawQuestion {
  q: string;
  options: string[];
  answer: number; // index into `options`
  tier?: Tier; // optional difficulty tag; absent => medium
}

const BANK = questions as RawQuestion[];
const TIERS = BANK.map((q) => tierNum(q.tier));

// Was the only module still on the legacy `(roundIndex*7 + Date.now()) % len` picker, which repeated
// questions within a session and showed every concurrent player the same one. Now uses the shared
// seeded, per-session, no-repeat picker (tier-aware: high bets draw harder questions first).
export const triviaModule = makeChoiceGame(
  {
    id: "trivia",
    title: "Trivia Rush",
    description: "Answer general-knowledge questions against the clock. Each correct answer is +0.1x.",
    thumbnail: "🧠",
    maxRounds: 5,
    timeLimitSec: TRIVIA_TIME_LIMIT_SEC,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty) => {
    const raw = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    return { prompt: raw.q, correct: raw.options[raw.answer], options: raw.options };
  }
);
