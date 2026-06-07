import { makeChoiceGame, pickIndex } from "./choiceGame";
import bank from "../../data/emoji.json";

interface EmojiQuestion {
  emoji: string;
  correct: string;
  decoys: string[];
}
const BANK = bank as EmojiQuestion[];

export const emojiModule = makeChoiceGame(
  {
    id: "emoji",
    title: "Emoji Puzzle",
    description: "Decode the emojis into a movie title. Each correct guess is +0.1x.",
    thumbnail: "🎬",
    maxRounds: 5,
    timeLimitSec: 15,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return { prompt: e.emoji, correct: e.correct, options: [e.correct, ...e.decoys] };
  }
);
