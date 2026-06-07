import { makeChoiceGame, pickIndex } from "./choiceGame";
import bank from "../../data/riddles.json";

interface RiddleQuestion {
  riddle: string;
  correct: string;
  decoys: string[];
}
const BANK = bank as RiddleQuestion[];

export const riddlesModule = makeChoiceGame(
  {
    id: "riddles",
    title: "Riddle Me This",
    description: "Solve the riddle before time runs out. Each correct answer is +0.1x.",
    thumbnail: "🧠",
    maxRounds: 5,
    timeLimitSec: 20,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const r = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return { prompt: r.riddle, correct: r.correct, options: [r.correct, ...r.decoys] };
  }
);
