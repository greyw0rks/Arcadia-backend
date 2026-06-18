import { makeChoiceGame, tieredPickIndex, tierNum, type Tier } from "./choiceGame";
import { GEO_TIME_LIMIT_SEC } from "../config";
import landmarks from "../../data/landmarks.json";
import geo from "../../data/geo.json";

interface Landmark {
  id: string;
  landmark: string;
  decoys: string[];
  tier?: Tier; // optional difficulty tag; absent => medium
}
interface GeoEntry {
  id: string;
  image: string;
}

// Reuses the GeoGuess image set, but asks for the landmark's name instead of its city. Only keeps
// landmark entries whose image actually exists in geo.json.
const IMAGE_BY_ID = new Map((geo as GeoEntry[]).map((g) => [g.id, g.image]));
const BANK = (landmarks as Landmark[]).filter((l) => IMAGE_BY_ID.has(l.id));
const TIERS = BANK.map((l) => tierNum(l.tier));

export const landmarkModule = makeChoiceGame(
  {
    id: "landmark",
    title: "Name That Landmark",
    description: "Identify the world-famous landmark in the photo. Each correct answer is +0.1x.",
    thumbnail: "🏛️",
    maxRounds: 5,
    timeLimitSec: GEO_TIME_LIMIT_SEC,
    bankSize: BANK.length,
  },
  (roundIndex, seed, difficulty) => {
    const e = BANK[tieredPickIndex(TIERS, roundIndex, seed, difficulty)];
    const t = e.tier;
    const imageStyle = t === 'extreme' ? 'extreme' : t === 'hard' ? 'hard' : undefined;
    return {
      prompt: "Which landmark is this?",
      imageUrl: IMAGE_BY_ID.get(e.id),
      imageStyle,
      correct: e.landmark,
      options: [e.landmark, ...e.decoys],
    };
  }
);
