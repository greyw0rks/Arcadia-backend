import { makeChoiceGame, pickIndex } from "./choiceGame";
import { GEO_TIME_LIMIT_SEC } from "../config";
import landmarks from "../../data/landmarks.json";
import geo from "../../data/geo.json";

interface Landmark {
  id: string;
  landmark: string;
  decoys: string[];
}
interface GeoEntry {
  id: string;
  image: string;
}

// Reuses the GeoGuess image set, but asks for the landmark's name instead of its city. Only keeps
// landmark entries whose image actually exists in geo.json.
const IMAGE_BY_ID = new Map((geo as GeoEntry[]).map((g) => [g.id, g.image]));
const BANK = (landmarks as Landmark[]).filter((l) => IMAGE_BY_ID.has(l.id));

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
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return {
      prompt: "Which landmark is this?",
      imageUrl: IMAGE_BY_ID.get(e.id),
      correct: e.landmark,
      options: [e.landmark, ...e.decoys],
    };
  }
);
