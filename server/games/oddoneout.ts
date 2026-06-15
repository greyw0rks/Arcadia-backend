import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import bank from "../../data/oddoneout.json";

interface OddQuestion {
  items: string[];
  odd: number;
  reason: string;
  tier?: Tier;
}
const BANK = bank as OddQuestion[];
const TIERS = BANK.map((e) => tierNum(e.tier));

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
  (roundIndex, seed, difficulty) => {
    const e = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    const correctItem = e.items[e.odd];
    return { prompt: "Which one doesn't belong?", correct: correctItem, options: e.items };
  }
);
