import { makeChoiceGame, pickIndex } from "./choiceGame";
import { TRIVIA_TIME_LIMIT_SEC } from "../config";
import bank from "../../data/truefalse.json";

interface TF {
  s: string;
  a: boolean;
}
const BANK = bank as TF[];

export const trueFalseModule = makeChoiceGame(
  {
    id: "truefalse",
    title: "True / False Blitz",
    description: "Rapid-fire: is the statement true or false? Each correct call is +0.1x.",
    thumbnail: "✅",
    maxRounds: 5,
    timeLimitSec: 10,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    const correct = e.a ? "True" : "False";
    return { prompt: e.s, correct, options: ["True", "False"] };
  }
);
