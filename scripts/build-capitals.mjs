// Rebuilds data/capitals.json. The old bank had 200 rows but only 10 DISTINCT countries (Japan ×20,
// etc.) with identical decoys — so "Capital Quiz" only ever asked 10 questions and felt repetitive
// regardless of the no-repeat picker. This replaces it with ~130 distinct countries.
//
// Each row: { country, flag, capital, decoys[3], tier }. Flags are derived from the ISO-3166 alpha-2
// code (regional-indicator emoji), so we don't hand-type 130 flags. Decoys are real capitals sampled
// (deterministically) from the SAME region for plausibility, falling back to global if a region is
// thin. Run from arcadia-backend:  node scripts/build-capitals.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data/capitals.json");

// [country, capital, iso2, region]
const RAW = [
  // Europe
  ["France", "Paris", "FR", "EU"], ["Germany", "Berlin", "DE", "EU"], ["Italy", "Rome", "IT", "EU"],
  ["Spain", "Madrid", "ES", "EU"], ["Portugal", "Lisbon", "PT", "EU"], ["United Kingdom", "London", "GB", "EU"],
  ["Ireland", "Dublin", "IE", "EU"], ["Netherlands", "Amsterdam", "NL", "EU"], ["Belgium", "Brussels", "BE", "EU"],
  ["Switzerland", "Bern", "CH", "EU"], ["Austria", "Vienna", "AT", "EU"], ["Sweden", "Stockholm", "SE", "EU"],
  ["Norway", "Oslo", "NO", "EU"], ["Denmark", "Copenhagen", "DK", "EU"], ["Finland", "Helsinki", "FI", "EU"],
  ["Iceland", "Reykjavik", "IS", "EU"], ["Poland", "Warsaw", "PL", "EU"], ["Czechia", "Prague", "CZ", "EU"],
  ["Slovakia", "Bratislava", "SK", "EU"], ["Hungary", "Budapest", "HU", "EU"], ["Greece", "Athens", "GR", "EU"],
  ["Romania", "Bucharest", "RO", "EU"], ["Bulgaria", "Sofia", "BG", "EU"], ["Croatia", "Zagreb", "HR", "EU"],
  ["Serbia", "Belgrade", "RS", "EU"], ["Ukraine", "Kyiv", "UA", "EU"], ["Russia", "Moscow", "RU", "EU"],
  ["Belarus", "Minsk", "BY", "EU"], ["Lithuania", "Vilnius", "LT", "EU"], ["Latvia", "Riga", "LV", "EU"],
  ["Estonia", "Tallinn", "EE", "EU"], ["Slovenia", "Ljubljana", "SI", "EU"], ["Luxembourg", "Luxembourg", "LU", "EU"],
  ["Malta", "Valletta", "MT", "EU"], ["Albania", "Tirana", "AL", "EU"], ["North Macedonia", "Skopje", "MK", "EU"],
  ["Montenegro", "Podgorica", "ME", "EU"], ["Bosnia and Herzegovina", "Sarajevo", "BA", "EU"],
  ["Moldova", "Chișinău", "MD", "EU"], ["Cyprus", "Nicosia", "CY", "EU"],
  // Asia / Middle East
  ["China", "Beijing", "CN", "AS"], ["Japan", "Tokyo", "JP", "AS"], ["South Korea", "Seoul", "KR", "AS"],
  ["North Korea", "Pyongyang", "KP", "AS"], ["India", "New Delhi", "IN", "AS"], ["Pakistan", "Islamabad", "PK", "AS"],
  ["Bangladesh", "Dhaka", "BD", "AS"], ["Sri Lanka", "Sri Jayawardenepura Kotte", "LK", "AS"],
  ["Nepal", "Kathmandu", "NP", "AS"], ["Bhutan", "Thimphu", "BT", "AS"], ["Myanmar", "Naypyidaw", "MM", "AS"],
  ["Thailand", "Bangkok", "TH", "AS"], ["Vietnam", "Hanoi", "VN", "AS"], ["Cambodia", "Phnom Penh", "KH", "AS"],
  ["Laos", "Vientiane", "LA", "AS"], ["Malaysia", "Kuala Lumpur", "MY", "AS"], ["Singapore", "Singapore", "SG", "AS"],
  ["Indonesia", "Jakarta", "ID", "AS"], ["Philippines", "Manila", "PH", "AS"], ["Brunei", "Bandar Seri Begawan", "BN", "AS"],
  ["Mongolia", "Ulaanbaatar", "MN", "AS"], ["Kazakhstan", "Astana", "KZ", "AS"], ["Uzbekistan", "Tashkent", "UZ", "AS"],
  ["Turkmenistan", "Ashgabat", "TM", "AS"], ["Kyrgyzstan", "Bishkek", "KG", "AS"], ["Tajikistan", "Dushanbe", "TJ", "AS"],
  ["Afghanistan", "Kabul", "AF", "AS"], ["Iran", "Tehran", "IR", "AS"], ["Iraq", "Baghdad", "IQ", "AS"],
  ["Saudi Arabia", "Riyadh", "SA", "AS"], ["United Arab Emirates", "Abu Dhabi", "AE", "AS"], ["Qatar", "Doha", "QA", "AS"],
  ["Kuwait", "Kuwait City", "KW", "AS"], ["Bahrain", "Manama", "BH", "AS"], ["Oman", "Muscat", "OM", "AS"],
  ["Yemen", "Sana'a", "YE", "AS"], ["Jordan", "Amman", "JO", "AS"], ["Lebanon", "Beirut", "LB", "AS"],
  ["Syria", "Damascus", "SY", "AS"], ["Israel", "Jerusalem", "IL", "AS"], ["Turkey", "Ankara", "TR", "AS"],
  ["Georgia", "Tbilisi", "GE", "AS"], ["Armenia", "Yerevan", "AM", "AS"], ["Azerbaijan", "Baku", "AZ", "AS"],
  // Africa
  ["Egypt", "Cairo", "EG", "AF"], ["Morocco", "Rabat", "MA", "AF"], ["Algeria", "Algiers", "DZ", "AF"],
  ["Tunisia", "Tunis", "TN", "AF"], ["Libya", "Tripoli", "LY", "AF"], ["Nigeria", "Abuja", "NG", "AF"],
  ["Ghana", "Accra", "GH", "AF"], ["Kenya", "Nairobi", "KE", "AF"], ["Ethiopia", "Addis Ababa", "ET", "AF"],
  ["Tanzania", "Dodoma", "TZ", "AF"], ["Uganda", "Kampala", "UG", "AF"], ["South Africa", "Pretoria", "ZA", "AF"],
  ["Zimbabwe", "Harare", "ZW", "AF"], ["Zambia", "Lusaka", "ZM", "AF"], ["Senegal", "Dakar", "SN", "AF"],
  ["Ivory Coast", "Yamoussoukro", "CI", "AF"], ["Cameroon", "Yaoundé", "CM", "AF"], ["Angola", "Luanda", "AO", "AF"],
  ["Mozambique", "Maputo", "MZ", "AF"], ["Botswana", "Gaborone", "BW", "AF"], ["Namibia", "Windhoek", "NA", "AF"],
  ["Rwanda", "Kigali", "RW", "AF"], ["Madagascar", "Antananarivo", "MG", "AF"], ["Sudan", "Khartoum", "SD", "AF"],
  ["Mali", "Bamako", "ML", "AF"],
  // Americas
  ["United States", "Washington, D.C.", "US", "AM"], ["Canada", "Ottawa", "CA", "AM"], ["Mexico", "Mexico City", "MX", "AM"],
  ["Guatemala", "Guatemala City", "GT", "AM"], ["Cuba", "Havana", "CU", "AM"], ["Jamaica", "Kingston", "JM", "AM"],
  ["Brazil", "Brasília", "BR", "AM"], ["Argentina", "Buenos Aires", "AR", "AM"], ["Chile", "Santiago", "CL", "AM"],
  ["Peru", "Lima", "PE", "AM"], ["Colombia", "Bogotá", "CO", "AM"], ["Venezuela", "Caracas", "VE", "AM"],
  ["Ecuador", "Quito", "EC", "AM"], ["Bolivia", "Sucre", "BO", "AM"], ["Paraguay", "Asunción", "PY", "AM"],
  ["Uruguay", "Montevideo", "UY", "AM"], ["Panama", "Panama City", "PA", "AM"], ["Costa Rica", "San José", "CR", "AM"],
  // Oceania
  ["Australia", "Canberra", "AU", "OC"], ["New Zealand", "Wellington", "NZ", "OC"], ["Fiji", "Suva", "FJ", "OC"],
  ["Papua New Guinea", "Port Moresby", "PG", "OC"],
];

// Tiers. Famous, intuitive capitals => easy. Notoriously tricky ones (admin capital ≠ largest city,
// or obscure country) => hard. Everything else => medium.
const EASY = new Set(["France", "Germany", "Italy", "Spain", "United Kingdom", "United States", "Greece",
  "Russia", "China", "Japan", "Egypt", "India", "Mexico", "Cuba", "Portugal", "Ireland", "Austria",
  "Poland", "Argentina", "Peru", "Thailand", "Iran", "Iraq"]);
const HARD = new Set(["Australia", "Canada", "Brazil", "Switzerland", "Turkey", "South Africa", "Nigeria",
  "Kazakhstan", "Myanmar", "Bhutan", "Turkmenistan", "Kyrgyzstan", "Tajikistan", "Brunei", "Bolivia",
  "Sri Lanka", "Ivory Coast", "Tanzania", "Montenegro", "North Macedonia", "Moldova", "Malta",
  "Bosnia and Herzegovina", "Madagascar", "Namibia", "Botswana", "Yemen", "Oman", "Eritrea",
  "Papua New Guinea", "Fiji", "Suriname", "Belize", "Cameroon", "Mali", "Senegal"]);

const flagOf = (iso) =>
  iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));

const tierOf = (country) => (EASY.has(country) ? "easy" : HARD.has(country) ? "hard" : "medium");

// Deterministic LCG so the build is reproducible (no Math.random → stable diffs).
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function pickDecoys(i) {
  const me = RAW[i];
  const rand = rng(i + 1);
  const sameRegion = RAW.filter((r, j) => j !== i && r[3] === me[3]).map((r) => r[1]);
  const others = RAW.filter((r, j) => j !== i).map((r) => r[1]);
  const pool = (sameRegion.length >= 3 ? sameRegion : others).filter((cap) => cap !== me[1]);
  const chosen = new Set();
  let guard = 0;
  while (chosen.size < 3 && guard++ < 500) {
    const cap = pool[Math.floor(rand() * pool.length)];
    if (cap && cap !== me[1]) chosen.add(cap);
  }
  // Top up from global if a region was too small.
  for (const cap of others) {
    if (chosen.size >= 3) break;
    if (cap !== me[1]) chosen.add(cap);
  }
  return [...chosen];
}

const out = RAW.map(([country, capital, iso], i) => ({
  country,
  flag: flagOf(iso),
  capital,
  decoys: pickDecoys(i),
  tier: tierOf(country),
}));

writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
const counts = out.reduce((a, e) => ((a[e.tier] = (a[e.tier] || 0) + 1), a), {});
console.log(`Wrote ${out.length} distinct countries to capitals.json`);
console.log("tier spread:", JSON.stringify(counts));
