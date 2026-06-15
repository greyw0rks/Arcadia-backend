// Seeds the HARD tier for riddles + trivia so high-bet sessions (which front-load the hard pool via
// tieredPickIndex) actually have hard questions to draw from. Existing entries stay untagged (=medium).
// Idempotent: re-running won't duplicate (matches on the riddle/question text). Run from arcadia-backend:
//   node scripts/append-hard.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RIDDLES = join(ROOT, "data/riddles.json");
const TRIVIA = join(ROOT, "data/trivia.json");

// Classic hard riddles: { riddle, correct, decoys[3] }
const HARD_RIDDLES = [
  { riddle: "The more you take, the more you leave behind. What am I?", correct: "Footsteps", decoys: ["Memories", "Shadows", "Time"] },
  { riddle: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", correct: "An echo", decoys: ["A ghost", "A whisper", "A shadow"] },
  { riddle: "What has keys but can't open locks?", correct: "A piano", decoys: ["A map", "A book", "A door"] },
  { riddle: "What has hands but cannot clap?", correct: "A clock", decoys: ["A statue", "A glove", "A robot"] },
  { riddle: "What gets wetter the more it dries?", correct: "A towel", decoys: ["A sponge", "Soap", "A cloud"] },
  { riddle: "I have cities but no houses, mountains but no trees, and water but no fish. What am I?", correct: "A map", decoys: ["A painting", "A globe", "A dream"] },
  { riddle: "What can travel around the world while staying in a corner?", correct: "A stamp", decoys: ["A satellite", "The wind", "A shadow"] },
  { riddle: "The maker sells it, the buyer never uses it, and the user never sees it. What is it?", correct: "A coffin", decoys: ["A gravestone", "A gift", "A will"] },
  { riddle: "What has a neck but no head?", correct: "A bottle", decoys: ["A shirt", "A guitar", "A giraffe"] },
  { riddle: "What has many teeth but cannot bite?", correct: "A comb", decoys: ["A saw", "A zipper", "A gear"] },
  { riddle: "What goes up but never comes down?", correct: "Your age", decoys: ["A balloon", "Smoke", "The sun"] },
  { riddle: "What can you catch but not throw?", correct: "A cold", decoys: ["A ball", "A fish", "A glance"] },
  { riddle: "I'm tall when I'm young and short when I'm old. What am I?", correct: "A candle", decoys: ["A tree", "A shadow", "A person"] },
  { riddle: "What has an eye but cannot see?", correct: "A needle", decoys: ["A button", "A wheel", "A door"] },
  { riddle: "What runs but never walks, has a bed but never sleeps?", correct: "A river", decoys: ["A clock", "A road", "A dream"] },
  { riddle: "What has a head and a tail but no body?", correct: "A coin", decoys: ["A snake", "A comet", "An arrow"] },
  { riddle: "Forward I am heavy, but backward I am not. What word am I?", correct: "Ton", decoys: ["Star", "Live", "Pool"] },
  { riddle: "What breaks the moment you say its name?", correct: "Silence", decoys: ["A promise", "A secret", "Glass"] },
];

// Hard trivia authored as { q, correct, decoys[3] } → stored as { q, options:[correct,...decoys], answer:0 }.
// The module shuffles option order at serve time, so a fixed answer index of 0 is fine.
const HARD_TRIVIA = [
  { q: "What is the smallest country in the world by area?", correct: "Vatican City", decoys: ["Monaco", "Nauru", "San Marino"] },
  { q: "Which element has the chemical symbol 'W'?", correct: "Tungsten", decoys: ["Tin", "Tantalum", "Titanium"] },
  { q: "What is the hardest known naturally occurring material?", correct: "Diamond", decoys: ["Quartz", "Titanium", "Graphite"] },
  { q: "Who painted the ceiling of the Sistine Chapel?", correct: "Michelangelo", decoys: ["Leonardo da Vinci", "Raphael", "Donatello"] },
  { q: "What is the largest planet in our solar system?", correct: "Jupiter", decoys: ["Saturn", "Neptune", "Uranus"] },
  { q: "In which year did the Berlin Wall fall?", correct: "1989", decoys: ["1991", "1987", "1985"] },
  { q: "What is the chemical symbol for gold?", correct: "Au", decoys: ["Ag", "Gd", "Go"] },
  { q: "Which language has the most native speakers worldwide?", correct: "Mandarin Chinese", decoys: ["English", "Spanish", "Hindi"] },
  { q: "What is the tallest mountain on Earth above sea level?", correct: "Mount Everest", decoys: ["K2", "Kangchenjunga", "Denali"] },
  { q: "Who wrote the play 'Hamlet'?", correct: "William Shakespeare", decoys: ["Christopher Marlowe", "Ben Jonson", "John Webster"] },
  { q: "What is the largest ocean on Earth?", correct: "The Pacific Ocean", decoys: ["The Atlantic Ocean", "The Indian Ocean", "The Arctic Ocean"] },
  { q: "What gas do plants primarily absorb for photosynthesis?", correct: "Carbon dioxide", decoys: ["Oxygen", "Nitrogen", "Hydrogen"] },
  { q: "Which country gifted the Statue of Liberty to the United States?", correct: "France", decoys: ["United Kingdom", "Italy", "Spain"] },
  { q: "What is the smallest prime number?", correct: "2", decoys: ["1", "3", "0"] },
  { q: "Which artist painted 'The Starry Night'?", correct: "Vincent van Gogh", decoys: ["Claude Monet", "Paul Cézanne", "Edvard Munch"] },
  { q: "What is the organelle known as the powerhouse of the cell?", correct: "The mitochondria", decoys: ["The nucleus", "The ribosome", "The Golgi apparatus"] },
  { q: "How many bones are in the adult human body?", correct: "206", decoys: ["201", "210", "196"] },
  { q: "Which planet is known as the Red Planet?", correct: "Mars", decoys: ["Venus", "Jupiter", "Mercury"] },
];

function appendUnique(arr, items, keyFn, build) {
  const seen = new Set(arr.map(keyFn));
  let added = 0;
  for (const it of items) {
    const built = build(it);
    if (seen.has(keyFn(built))) continue;
    arr.push(built);
    added++;
  }
  return added;
}

const riddles = JSON.parse(readFileSync(RIDDLES, "utf8"));
const trivia = JSON.parse(readFileSync(TRIVIA, "utf8"));

const rAdded = appendUnique(
  riddles,
  HARD_RIDDLES,
  (r) => r.riddle,
  (r) => ({ riddle: r.riddle, correct: r.correct, decoys: r.decoys, tier: "hard" })
);
const tAdded = appendUnique(
  trivia,
  HARD_TRIVIA,
  (t) => t.q,
  (t) => ({ q: t.q, options: [t.correct, ...t.decoys], answer: 0, tier: "hard" })
);

writeFileSync(RIDDLES, JSON.stringify(riddles, null, 2) + "\n");
writeFileSync(TRIVIA, JSON.stringify(trivia, null, 2) + "\n");
console.log(`riddles: +${rAdded} hard (now ${riddles.length}) | trivia: +${tAdded} hard (now ${trivia.length})`);
