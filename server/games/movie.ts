import { makeChoiceGame, drawTiered, tierNum, type Tier } from "./choiceGame";
import { GEO_TIME_LIMIT_SEC } from "../config";
import movies from "../../data/movies.json";

interface Movie {
  id: string;
  answer: string;
  decoys: string[];
  image: string;
  tier?: Tier;
}

const BANK = movies as Movie[];
const TIERS = BANK.map((e) => tierNum(e.tier));

export const movieModule = {
  ...makeChoiceGame(
  {
    id: "movie",
    title: "Movie Stills",
    description: "Name the movie from a screenshot. Each correct answer is +0.1x.",
    thumbnail: "🎬",
    maxRounds: 5,
    timeLimitSec: GEO_TIME_LIMIT_SEC,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty, tierSchedule) => {
    const { entry: e, tier } = drawTiered(BANK, TIERS, roundIndex, seed, difficulty, tierSchedule);
    return {
      prompt: "Which movie is this from?",
      imageUrl: e.image,
      correct: e.answer,
      options: [e.answer, ...e.decoys],
      tier,
    };
  }
  ),
  available: false,
};
