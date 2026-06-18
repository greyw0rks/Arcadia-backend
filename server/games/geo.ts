import { GameModule, RoundState } from "./types";
import { GEO_TIME_LIMIT_SEC } from "../config";
import { shuffle, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import locations from "../../data/geo.json";

interface GeoEntry {
  id: string;
  answer: string;
  decoys: string[];
  image: string; // served from /public (e.g. /geo/eiffel.jpg)
  source: string;
  tier?: Tier; // optional difficulty tag; absent => medium
}

const BANK = locations as GeoEntry[];
const TIERS = BANK.map((e) => tierNum(e.tier));

// Tier-aware, seeded, per-session, no-repeat pick (shared with the choice games). A higher bet draws
// harder/obscure locations first; ordering differs per session.
function pickEntry(roundIndex: number, seed: number, difficulty?: number): GeoEntry {
  return BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
}

// Mapillary swap-in: to use real street-view imagery instead of this curated landmark set, replace
// pickEntry/buildRound to fetch an image + its true location from the Mapillary API (set MAPILLARY_TOKEN
// in the env) and derive the place options from reverse geocoding. The RoundView shape is unchanged.
export const geoModule: GameModule = {
  id: "geo",
  title: "GeoGuess",
  description: "Look at the photo and guess where in the world it is. Each correct guess is +0.1x.",
  thumbnail: "🌍",
  maxRounds: 5,
  bankSize: BANK.length,
  available: true,

  buildRound(roundIndex: number, seed: number, difficulty?: number): RoundState {
    const entry = pickEntry(roundIndex, seed, difficulty);
    const options = shuffle([entry.answer, ...entry.decoys], seed + roundIndex + 1);
    const correctIndex = options.indexOf(entry.answer);
    const t = entry.tier;
    const imageStyle = t === 'extreme' ? 'extreme' : t === 'hard' ? 'hard' : undefined;

    return {
      view: {
        roundIndex,
        totalRounds: this.maxRounds,
        prompt: "Where in the world is this?",
        imageUrl: entry.image,
        imageStyle,
        options,
        timeLimitSec: GEO_TIME_LIMIT_SEC,
      },
      correctIndex,
      deadline: 0,
    };
  },
};
