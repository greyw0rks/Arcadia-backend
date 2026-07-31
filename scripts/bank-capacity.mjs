#!/usr/bin/env node
// scripts/bank-capacity.mjs — how long do the question banks last under V2 volume?
//
// §3.1 of the economy spec originally modelled exhaustion as (bank size / even split across
// formats), which gives ~3 weeks for the smallest banks. That is optimistic: §4.1 draws from a
// TIER within a bank, not from the bank, so the binding constraint is a tier cell and it is much
// smaller. This prints both models so the difference stays visible.
//
// Re-run after any bank edit or any change to the §4.1 recipes:
//   node scripts/bank-capacity.mjs

import { readFileSync } from "node:fs";

const ROUNDS_PER_WEEK = 10 * 7; // 10 free sections/day
const QUESTIONS_PER_ROUND = 15;

// Bank-backed formats only. `math` is procedural and never exhausts.
const BANKS = {
  trivia: "trivia",
  truefalse: "truefalse",
  riddles: "riddles",
  emoji: "emoji",
  oddoneout: "oddoneout",
  capitals: "capitals",
  geo: "geo",
  landmark: "landmarks",
};

// §4.1 difficulty curve: [easy, medium, hard, extreme] slots per 15-question round.
const BANDS = {
  "0.01-0.50 recovery": [4, 7, 4, 0],
  "0.51-0.90": [2, 7, 6, 0],
  "0.91-1.20 baseline": [0, 6, 7, 2],
  "1.21-1.60": [0, 3, 8, 4],
  "1.61-2.20": [0, 1, 7, 7],
  "2.21+ elite": [0, 0, 4, 11],
};

const TIERS = ["easy", "medium", "hard", "extreme"];

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));

const perFormat = {};
const pool = { easy: 0, medium: 0, hard: 0, extreme: 0 };

for (const [name, file] of Object.entries(BANKS)) {
  const counts = { easy: 0, medium: 0, hard: 0, extreme: 0 };
  for (const entry of load(file)) counts[entry.tier ?? "medium"]++;
  perFormat[name] = { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  for (const t of TIERS) pool[t] += counts[t];
}

const pad = (v, n) => String(v).padStart(n);

console.log("PER-FORMAT TIER MATRIX");
console.log("format       total   easy medium   hard extreme");
for (const [name, c] of Object.entries(perFormat)) {
  console.log(
    name.padEnd(12), pad(c.total, 5), pad(c.easy, 6), pad(c.medium, 6), pad(c.hard, 6), pad(c.extreme, 7)
  );
}

const missing = TIERS.map((t) => [t, Object.entries(perFormat).filter(([, c]) => c[t] === 0).map(([n]) => n)])
  .filter(([, f]) => f.length);
if (missing.length) {
  console.log("\nTIERS WITH NO QUESTIONS IN SOME FORMATS (tiersNearTarget silently substitutes):");
  for (const [tier, formats] of missing) console.log(`  ${tier}: ${formats.join(", ")}`);
}

console.log("\nOPTIMISTIC MODEL — bank size / even split across formats");
const evenSplit = (ROUNDS_PER_WEEK * QUESTIONS_PER_ROUND) / Object.keys(BANKS).length;
for (const [name, c] of Object.entries(perFormat)) {
  console.log(`  ${name.padEnd(12)} ${(c.total / evenSplit).toFixed(1)} weeks`);
}

console.log("\nTIER MODEL — weeks until a band's scarcest tier runs dry (the real constraint)");
console.log("band                   easy medium   hard extreme   BINDING");
let worst = { weeks: Infinity };
for (const [band, recipe] of Object.entries(BANDS)) {
  const weeks = recipe.map((slots, i) => (slots === 0 ? Infinity : pool[TIERS[i]] / (slots * ROUNDS_PER_WEEK)));
  const min = Math.min(...weeks);
  const tier = TIERS[weeks.indexOf(min)];
  if (min < worst.weeks) worst = { weeks: min, tier, band };
  const cells = weeks.map((w) => (w === Infinity ? "   -- " : w.toFixed(1).padStart(6))).join(" ");
  console.log(band.padEnd(22), cells, `  ${tier} @ ${min.toFixed(1)} wk`);
}

console.log(
  `\nWORST CELL: ${worst.tier} in the "${worst.band}" band — ${worst.weeks.toFixed(1)} weeks.`
);
console.log("Beyond that point players see repeats, which inflate measured accuracy and");
console.log("corrupt the per-tier calibration sample (§3.1a, §4.1).");
