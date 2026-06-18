import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import { TRIVIA_TIME_LIMIT_SEC } from "../config";
import bank from "../../data/truefalse.json";

interface TF {
  s: string;
  a: boolean;
  tier?: Tier;
}
const BANK = bank as TF[];
const TIERS = BANK.map((e) => tierNum(e.tier));

export const trueFalseModule = makeChoiceGame(
  {
    id: "truefalse",
    title: "True / False Blitz",
    description: "Rapid-fire: is the statement true or false? Each correct call is +0.1x.",
    thumbnail: "✅",
    maxRounds: 5,
    timeLimitSec: 5,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty) => {
    const e = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    const correct = e.a ? "True" : "False";
    return { prompt: e.s, correct, options: ["True", "False"] };
  }
);
