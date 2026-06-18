import { makeChoiceGame, pickIndex } from "./choiceGame";
import colors from "../../data/colors.json";

interface Color {
  name: string;
  hex: string;
  decoys: string[];
}

const BANK = colors as Color[];

// Generates a 200x200 solid-color PNG as a data URI (so no file download needed).
function colorSwatchDataUri(hex: string): string {
  // A minimal 1x1 PNG with the color, scaled via CSS. For a real swatch, this would be a proper
  // canvas-rendered PNG, but a data URI placeholder works for the MVP.
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='${encodeURIComponent(hex)}'/%3E%3C/svg%3E`;
}

export const colorModule = makeChoiceGame(
  {
    id: "color",
    title: "Hex Match",
    description: "Match the color swatch to its hex code. Each correct answer is +0.1x.",
    thumbnail: "🎨",
    maxRounds: 5,
    timeLimitSec: 7,
    bankSize: BANK.length,
  },
  (roundIndex, seed) => {
    const e = BANK[pickIndex(BANK.length, roundIndex, seed)];
    return {
      prompt: `What is the hex code for this color?`,
      imageUrl: colorSwatchDataUri(e.hex),
      correct: e.hex,
      options: [e.hex, ...e.decoys],
    };
  }
);
