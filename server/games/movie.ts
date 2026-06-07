import { makeChoiceGame, pickIndex } from "./choiceGame";
import { GEO_TIME_LIMIT_SEC } from "../config";
import movies from "../../data/movies.json";

interface Movie {
  id: string;
  answer: string;
  decoys: string[];
  image: string;
}

const BANK = movies as Movie[];

export const movieModule = makeChoiceGame(
  {
    id: "movie",
    title: "Movie Stills",
    description: "Name the movie from a screenshot. Each correct answer is +0.1x.",
    thumbnail: "🎬",
    maxRounds: 5,
    timeLimitSec: GEO_TIME_LIMIT_SEC,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return {
      prompt: "Which movie is this from?",
      imageUrl: e.image,
      correct: e.answer,
      options: [e.answer, ...e.decoys],
    };
  }
);
