import { makeChoiceGame, pickIndex } from "./choiceGame";
import bank from "../../data/oddoneout.json";

interface OddQuestion {
  items: string[];
  odd: number;
  reason: string;
}
const BANK = bank as OddQuestion[];

export const oddOneOutModule = makeChoiceGame(
  {
    id: "oddoneout",
    title: "Odd One Out",
    description: "Four items, one doesn't belong. Spot it for +0.1x.",
    thumbnail: "🧩",
    maxRounds: 5,
    timeLimitSec: 15,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    const correctItem = e.items[e.odd];
    return { prompt: "Which one doesn't belong?", correct: correctItem, options: e.items };
  }
);
