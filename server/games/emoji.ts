import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import bank from "../../data/emoji.json";

interface EmojiQuestion {
  emoji: string;
  correct: string;
  decoys: string[];
  tier?: Tier;
}
const BANK = bank as EmojiQuestion[];
const TIERS = BANK.map((e) => tierNum(e.tier));

export const emojiModule = makeChoiceGame(
  {
    id: "emoji",
    title: "Emoji Puzzle",
    description: "Decode the emojis into a movie title. Each correct guess is +0.1x.",
    thumbnail: "🎬",
    maxRounds: 5,
    timeLimitSec: 8,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty) => {
    const e = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    return { prompt: e.emoji, correct: e.correct, options: [e.correct, ...e.decoys] };
  }
);
