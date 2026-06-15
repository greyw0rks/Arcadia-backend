import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import bank from "../../data/capitals.json";

interface Capital {
  country: string;
  flag: string;
  capital: string;
  decoys: string[];
  tier?: Tier; // optional difficulty tag; absent => medium
}
const BANK = bank as Capital[];
const TIERS = BANK.map((c) => tierNum(c.tier));

export const capitalsModule = makeChoiceGame(
  {
    id: "capitals",
    title: "Capital Quiz",
    description: "Name the capital city of each country. Each correct answer is +0.1x.",
    thumbnail: "🚩",
    maxRounds: 5,
    timeLimitSec: 13,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty) => {
    const e = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    return {
      prompt: `${e.flag}  What is the capital of ${e.country}?`,
      correct: e.capital,
      options: [e.capital, ...e.decoys],
    };
  }
);
