import { makeChoiceGame, pickIndex } from "./choiceGame";
import { GEO_TIME_LIMIT_SEC } from "../config";
import logos from "../../data/logos.json";

interface Logo {
  id: string;
  answer: string;
  decoys: string[];
  image: string;
}

const BANK = logos as Logo[];

export const logoModule = makeChoiceGame(
  {
    id: "logo",
    title: "Logo Quiz",
    description: "Identify the brand from its logo. Each correct answer is +0.1x.",
    thumbnail: "🏷️",
    maxRounds: 5,
    timeLimitSec: GEO_TIME_LIMIT_SEC,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return {
      prompt: "Which brand is this?",
      imageUrl: e.image,
      correct: e.answer,
      options: [e.answer, ...e.decoys],
    };
  }
);
