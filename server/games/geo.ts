import { GameModule, RoundState } from "./types";
import { GEO_TIME_LIMIT_SEC } from "../config";
import locations from "../../data/geo.json";

interface GeoEntry {
  id: string;
  answer: string;
  decoys: string[];
  image: string; // served from /public (e.g. /geo/eiffel.jpg)
  source: string;
}

const BANK = locations as GeoEntry[];

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Seeded per-session permutation: no repeats within a session (bank >= maxRounds) and a different
// ordering per session. Mirrors choiceGame.pickIndex.
function pickEntry(roundIndex: number, seed: number): GeoEntry {
  const order = shuffle(
    Array.from({ length: BANK.length }, (_, i) => i),
    seed
  );
  return BANK[order[roundIndex % BANK.length]];
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

  buildRound(roundIndex: number, seed: number): RoundState {
    const entry = pickEntry(roundIndex, seed);
    const options = shuffle([entry.answer, ...entry.decoys], seed + roundIndex + 1);
    const correctIndex = options.indexOf(entry.answer);

    return {
      view: {
        roundIndex,
        totalRounds: this.maxRounds,
        prompt: "Where in the world is this?",
        imageUrl: entry.image,
        options,
        timeLimitSec: GEO_TIME_LIMIT_SEC,
      },
      correctIndex,
      deadline: 0, // stamped by the session manager when served
    };
  },
};
