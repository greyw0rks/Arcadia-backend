import { makeChoiceGame, pickIndex } from "./choiceGame";
import words from "../../data/words.json";

interface WordQuestion {
  prompt: string;
  correct: string;
  decoys: string[];
}

const BANK = words as WordQuestion[];

export const wordModule = makeChoiceGame(
  {
    id: "word",
    title: "Letter League",
    description: "Unscramble the letters or solve the word puzzle. Each correct answer is +0.1x.",
    thumbnail: "🔤",
    maxRounds: 5,
    timeLimitSec: 8,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const w = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return { prompt: w.prompt, correct: w.correct, options: [w.correct, ...w.decoys] };
  }
);
