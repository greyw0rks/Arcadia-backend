import { makeChoiceGame, drawTiered, tierNum, type Tier } from "./choiceGame";
import { GEO_TIME_LIMIT_SEC } from "../config";
import moviesRaw from "../../data/movies.json";

interface Movie {
  id: string;
  answer: string;
  decoys: string[];
  image: string;
  clue?: string;
  tier?: Tier;
}

// Facts-based format: players guess the film from a spoiler-free description, not a screenshot.
// Only entries carrying a `clue` are served — the image field is no longer used. Entries without a
// clue are content-pending and excluded from the bank so a round never renders a blank prompt.
const BANK = (moviesRaw as Movie[]).filter((e) => !!e.clue);
const TIERS = BANK.map((e) => tierNum(e.tier));

export const movieModule = {
  ...makeChoiceGame(
  {
    id: "movie",
    title: "Movie Facts",
    description: "Guess the film from a short description. Each correct answer is +0.1x.",
    thumbnail: "🎬",
    maxRounds: 5,
    timeLimitSec: GEO_TIME_LIMIT_SEC,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty, tierSchedule) => {
    const { entry: e, tier } = drawTiered(BANK, TIERS, roundIndex, seed, difficulty, tierSchedule);
    return {
      prompt: e.clue!,
      correct: e.answer,
      options: [e.answer, ...e.decoys],
      tier,
    };
  }
  ),
  available: true,
};
