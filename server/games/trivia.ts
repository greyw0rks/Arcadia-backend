import { GameModule, RoundState } from "./types";
import { TRIVIA_TIME_LIMIT_SEC } from "../config";
import questions from "../../data/trivia.json";

interface RawQuestion {
  q: string;
  options: string[];
  answer: number;
}

const BANK = questions as RawQuestion[];

// Deterministic-enough shuffle seeded by round; avoids needing crypto here. The security property we
// need is that the CLIENT can't derive the answer, not unpredictability to the server.
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestion(roundIndex: number): RawQuestion {
  // Spread picks across the bank without repeats within a typical 5-round session.
  const idx = (roundIndex * 7 + ((Date.now() / 1000) | 0)) % BANK.length;
  return BANK[idx];
}

export const triviaModule: GameModule = {
  id: "trivia",
  title: "Trivia Rush",
  description: "Answer general-knowledge questions against the clock. Each correct answer is +0.1x.",
  thumbnail: "🧠",
  maxRounds: 5,
  bankSize: BANK.length,
  available: true,

  buildRound(roundIndex: number): RoundState {
    const raw = pickQuestion(roundIndex);
    const correctText = raw.options[raw.answer];
    const shuffled = shuffle(raw.options, roundIndex + 1);
    const correctIndex = shuffled.indexOf(correctText);

    return {
      view: {
        roundIndex,
        totalRounds: this.maxRounds,
        prompt: raw.q,
        options: shuffled,
        timeLimitSec: TRIVIA_TIME_LIMIT_SEC,
      },
      correctIndex,
      deadline: 0, // stamped by the session manager when the round is served
    };
  },
};
