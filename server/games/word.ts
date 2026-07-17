import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import words from "../../data/words.json";

interface WordQuestion {
  prompt: string;
  correct: string;
  decoys: string[];
  tier?: Tier; // difficulty tag (by answer length); absent => medium
}

const BANK = words as WordQuestion[];
const TIERS = BANK.map((w) => tierNum(w.tier));

export const wordModule = {
  ...makeChoiceGame(
    {
      id: "word",
      title: "Letter League",
      description: "Unscramble the letters or solve the word puzzle. Each correct answer is +0.1x.",
      thumbnail: "🔤",
      maxRounds: 5,
      timeLimitSec: 8,
      bankSize: BANK.length,
    },
    (roundIndex, seed, difficulty) => {
      const w = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
      return { prompt: w.prompt, correct: w.correct, options: [w.correct, ...w.decoys] };
    }
  ),
  available: false, // "Coming soon" — hidden from the live game list
};
