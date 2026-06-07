import { makeChoiceGame, pickIndex } from "./choiceGame";
import bank from "../../data/capitals.json";

interface Capital {
  country: string;
  flag: string;
  capital: string;
  decoys: string[];
}
const BANK = bank as Capital[];

export const capitalsModule = makeChoiceGame(
  {
    id: "capitals",
    title: "Capital Quiz",
    description: "Name the capital city of each country. Each correct answer is +0.1x.",
    thumbnail: "🚩",
    maxRounds: 5,
    timeLimitSec: 15,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return {
      prompt: `${e.flag}  What is the capital of ${e.country}?`,
      correct: e.capital,
      options: [e.capital, ...e.decoys],
    };
  }
);
