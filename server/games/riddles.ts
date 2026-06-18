import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import bank from "../../data/riddles.json";

interface RiddleQuestion {
  riddle: string;
  correct: string;
  decoys: string[];
  tier?: Tier; // optional difficulty tag; absent => medium
}
const BANK = bank as RiddleQuestion[];
const TIERS = BANK.map((r) => tierNum(r.tier));

export const riddlesModule = makeChoiceGame(
  {
    id: "riddles",
    title: "Riddle Me This",
    description: "Solve the riddle before time runs out. Each correct answer is +0.1x.",
    thumbnail: "🧠",
    maxRounds: 5,
    timeLimitSec: 9,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty) => {
    const r = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    return { prompt: r.riddle, correct: r.correct, options: [r.correct, ...r.decoys] };
  }
);
