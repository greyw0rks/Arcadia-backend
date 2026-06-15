// One-shot content generator: expands the GeoGuess + Name-That-Landmark banks.
//
// For each curated NEW entry it fetches the landmark's Wikipedia REST summary, pulls the real
// upload.wikimedia.org image URL (no filename guessing), downloads a ~1024px copy into public/geo/,
// validates it's a real image, and — only on success — appends matching entries to data/geo.json and
// data/landmarks.json (same `id`, so landmark reuses the photo). It also tags the EXISTING 43 entries
// with difficulty tiers. Idempotent: ids already present in geo.json are skipped.
//
// Run from arcadia-backend:  node scripts/expand-geo.mjs

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO_JSON = join(ROOT, "data/geo.json");
const LM_JSON = join(ROOT, "data/landmarks.json");
const IMG_DIR = join(ROOT, "public/geo");
const UA = "ArcadiaGame/1.0 (educational quiz; contact@arcadia.example)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Difficulty tiers for the EXISTING 43 ids (by global fame). Missing => medium.
const EXISTING_TIERS = {
  eiffel: "easy", colosseum: "easy", opera: "easy", taj: "easy", ggbridge: "easy",
  liberty: "easy", bigben: "easy", redeemer: "easy", burj: "easy", pisa: "easy",
  greatwall: "easy", gizapyramid: "easy", hollywood: "easy", whitehouse: "easy",
  sagrada: "medium", acropolis: "medium", forbidden: "medium", fuji: "medium", senso: "medium",
  angkor: "medium", marina: "medium", neuschwanstein: "medium", stbasil: "medium", hagia: "medium",
  burjalarab: "medium", chichen: "medium", spaceneedle: "medium", brandenburg: "medium",
  charlesbridge: "medium", moai: "medium", uluru: "medium", wat: "medium", gateofindia: "medium",
  petra: "medium",
  atomium: "hard", windmills: "hard", littlemermaid: "hard", westernwall: "hard", gatewaymo: "hard",
  obelisco: "hard", tianjin: "hard", nblue: "hard", tablemountain: "hard",
};

// Curated NEW entries. wiki = Wikipedia page title used to fetch the lead image.
const NEW = [
  { id: "machupicchu", wiki: "Machu Picchu", answer: "Cusco Region, Peru", cityDecoys: ["La Paz, Bolivia", "Quito, Ecuador", "Bogotá, Colombia"], landmark: "Machu Picchu", lmDecoys: ["Chichen Itza", "Tikal", "Sacsayhuamán"], tier: "medium" },
  { id: "borobudur", wiki: "Borobudur", answer: "Central Java, Indonesia", cityDecoys: ["Bagan, Myanmar", "Siem Reap, Cambodia", "Ayutthaya, Thailand"], landmark: "Borobudur", lmDecoys: ["Angkor Wat", "Bagan", "Prambanan"], tier: "medium" },
  { id: "bagan", wiki: "Bagan", answer: "Bagan, Myanmar", cityDecoys: ["Luang Prabang, Laos", "Siem Reap, Cambodia", "Chiang Mai, Thailand"], landmark: "Bagan Temples", lmDecoys: ["Borobudur", "Angkor Wat", "Ayutthaya"], tier: "hard" },
  { id: "prambanan", wiki: "Prambanan", answer: "Yogyakarta, Indonesia", cityDecoys: ["Bagan, Myanmar", "Siem Reap, Cambodia", "Kandy, Sri Lanka"], landmark: "Prambanan", lmDecoys: ["Borobudur", "Angkor Wat", "Bagan"], tier: "hard" },
  { id: "himeji", wiki: "Himeji Castle", answer: "Himeji, Japan", cityDecoys: ["Kyoto, Japan", "Osaka, Japan", "Nagoya, Japan"], landmark: "Himeji Castle", lmDecoys: ["Osaka Castle", "Nijō Castle", "Matsumoto Castle"], tier: "medium" },
  { id: "potala", wiki: "Potala Palace", answer: "Lhasa, Tibet", cityDecoys: ["Kathmandu, Nepal", "Thimphu, Bhutan", "Leh, India"], landmark: "Potala Palace", lmDecoys: ["Tashilhunpo Monastery", "Tiger's Nest", "Jokhang Temple"], tier: "hard" },
  { id: "alhambra", wiki: "Alhambra", answer: "Granada, Spain", cityDecoys: ["Seville, Spain", "Córdoba, Spain", "Fez, Morocco"], landmark: "Alhambra", lmDecoys: ["Mezquita of Córdoba", "Seville Alcázar", "Aljafería"], tier: "medium" },
  { id: "montstmichel", wiki: "Mont-Saint-Michel", answer: "Normandy, France", cityDecoys: ["Brittany, France", "Cornwall, England", "Galicia, Spain"], landmark: "Mont-Saint-Michel", lmDecoys: ["St Michael's Mount", "Rocamadour", "Le Puy-en-Velay"], tier: "medium" },
  { id: "matterhorn", wiki: "Matterhorn", answer: "Zermatt, Switzerland", cityDecoys: ["Chamonix, France", "Cortina, Italy", "Innsbruck, Austria"], landmark: "Matterhorn", lmDecoys: ["Mont Blanc", "Eiger", "Jungfrau"], tier: "medium" },
  { id: "cntower", wiki: "CN Tower, Toronto", answer: "Toronto, Canada", cityDecoys: ["Chicago, USA", "Seattle, USA", "Montreal, Canada"], landmark: "CN Tower", lmDecoys: ["Space Needle", "Willis Tower", "Sky Tower"], tier: "easy" },
  { id: "petronas", wiki: "Petronas Towers", answer: "Kuala Lumpur, Malaysia", cityDecoys: ["Singapore", "Jakarta, Indonesia", "Bangkok, Thailand"], landmark: "Petronas Towers", lmDecoys: ["Taipei 101", "Burj Khalifa", "Marina Bay Sands"], tier: "easy" },
  { id: "taipei101", wiki: "Taipei 101", answer: "Taipei, Taiwan", cityDecoys: ["Hong Kong", "Shanghai, China", "Seoul, South Korea"], landmark: "Taipei 101", lmDecoys: ["Petronas Towers", "Shanghai Tower", "Burj Khalifa"], tier: "easy" },
  { id: "sheikhzayed", wiki: "Sheikh Zayed Mosque", answer: "Abu Dhabi, UAE", cityDecoys: ["Doha, Qatar", "Muscat, Oman", "Manama, Bahrain"], landmark: "Sheikh Zayed Grand Mosque", lmDecoys: ["Sultan Qaboos Mosque", "Faisal Mosque", "Blue Mosque"], tier: "medium" },
  { id: "bluemosque", wiki: "Sultan Ahmed Mosque", answer: "Istanbul, Turkey", cityDecoys: ["Cairo, Egypt", "Isfahan, Iran", "Bursa, Turkey"], landmark: "Blue Mosque", lmDecoys: ["Hagia Sophia", "Süleymaniye Mosque", "Selimiye Mosque"], tier: "medium" },
  { id: "teotihuacan", wiki: "Teotihuacan", answer: "State of Mexico, Mexico", cityDecoys: ["Oaxaca, Mexico", "Yucatán, Mexico", "Guatemala City, Guatemala"], landmark: "Teotihuacan", lmDecoys: ["Chichen Itza", "Tikal", "Monte Albán"], tier: "hard" },
  { id: "tikal", wiki: "Tikal", answer: "Petén, Guatemala", cityDecoys: ["Yucatán, Mexico", "Copán, Honduras", "Belize City, Belize"], landmark: "Tikal", lmDecoys: ["Chichen Itza", "Teotihuacan", "Palenque"], tier: "hard" },
  { id: "niagara", wiki: "Niagara Falls", answer: "Ontario, Canada", cityDecoys: ["New York, USA", "Quebec, Canada", "Michigan, USA"], landmark: "Niagara Falls", lmDecoys: ["Victoria Falls", "Iguazu Falls", "Angel Falls"], tier: "easy" },
  { id: "victoriafalls", wiki: "Victoria Falls", answer: "Livingstone, Zambia", cityDecoys: ["Nairobi, Kenya", "Maun, Botswana", "Arusha, Tanzania"], landmark: "Victoria Falls", lmDecoys: ["Niagara Falls", "Iguazu Falls", "Murchison Falls"], tier: "medium" },
  { id: "grandcanyon", wiki: "Grand Canyon", answer: "Arizona, USA", cityDecoys: ["Utah, USA", "Nevada, USA", "Colorado, USA"], landmark: "Grand Canyon", lmDecoys: ["Bryce Canyon", "Zion Canyon", "Antelope Canyon"], tier: "easy" },
  { id: "mountrushmore", wiki: "Mount Rushmore", answer: "South Dakota, USA", cityDecoys: ["Wyoming, USA", "Montana, USA", "Colorado, USA"], landmark: "Mount Rushmore", lmDecoys: ["Crazy Horse Memorial", "Stone Mountain", "Mount Vernon"], tier: "easy" },
  { id: "santorini", wiki: "Santorini", answer: "Santorini, Greece", cityDecoys: ["Mykonos, Greece", "Naxos, Greece", "Bodrum, Turkey"], landmark: "Santorini", lmDecoys: ["Mykonos", "Positano", "Oia"], tier: "medium" },
  { id: "dubrovnik", wiki: "Dubrovnik", answer: "Dubrovnik, Croatia", cityDecoys: ["Split, Croatia", "Kotor, Montenegro", "Venice, Italy"], landmark: "Dubrovnik Old Town", lmDecoys: ["Kotor Old Town", "Split's Diocletian's Palace", "Mdina"], tier: "hard" },
  { id: "meteora", wiki: "Meteora", answer: "Thessaly, Greece", cityDecoys: ["Epirus, Greece", "Cappadocia, Turkey", "Mount Athos, Greece"], landmark: "Meteora", lmDecoys: ["Mount Athos", "Cappadocia", "Sümela Monastery"], tier: "hard" },
  { id: "edinburghcastle", wiki: "Edinburgh Castle", answer: "Edinburgh, Scotland", cityDecoys: ["Stirling, Scotland", "Dublin, Ireland", "York, England"], landmark: "Edinburgh Castle", lmDecoys: ["Stirling Castle", "Edinburgh's Holyrood Palace", "Windsor Castle"], tier: "medium" },
  { id: "towerbridge", wiki: "Tower Bridge", answer: "London, UK", cityDecoys: ["Newcastle, UK", "Manchester, UK", "Liverpool, UK"], landmark: "Tower Bridge", lmDecoys: ["London Bridge", "Millennium Bridge", "Brooklyn Bridge"], tier: "easy" },
  { id: "stonehenge", wiki: "Stonehenge", answer: "Wiltshire, England", cityDecoys: ["Cornwall, England", "Orkney, Scotland", "County Meath, Ireland"], landmark: "Stonehenge", lmDecoys: ["Avebury", "Carnac Stones", "Newgrange"], tier: "easy" },
  { id: "versailles", wiki: "Palace of Versailles", answer: "Versailles, France", cityDecoys: ["Vienna, Austria", "Madrid, Spain", "Potsdam, Germany"], landmark: "Palace of Versailles", lmDecoys: ["Schönbrunn Palace", "Royal Palace of Madrid", "Sanssouci"], tier: "medium" },
  { id: "colognecathedral", wiki: "Cologne Cathedral", answer: "Cologne, Germany", cityDecoys: ["Strasbourg, France", "Milan, Italy", "Vienna, Austria"], landmark: "Cologne Cathedral", lmDecoys: ["Milan Cathedral", "Strasbourg Cathedral", "Notre-Dame de Paris"], tier: "medium" },
  { id: "florenceduomo", wiki: "Florence Cathedral", answer: "Florence, Italy", cityDecoys: ["Siena, Italy", "Bologna, Italy", "Pisa, Italy"], landmark: "Florence Cathedral (Duomo)", lmDecoys: ["Milan Cathedral", "St Peter's Basilica", "Siena Cathedral"], tier: "medium" },
  { id: "sanmarco", wiki: "Piazza San Marco", answer: "Venice, Italy", cityDecoys: ["Florence, Italy", "Verona, Italy", "Trieste, Italy"], landmark: "St Mark's Square", lmDecoys: ["Piazza Navona", "Piazza del Duomo", "St Peter's Square"], tier: "medium" },
  { id: "terracotta", wiki: "Terracotta Army", answer: "Xi'an, China", cityDecoys: ["Luoyang, China", "Nanjing, China", "Chengdu, China"], landmark: "Terracotta Army", lmDecoys: ["Forbidden City", "Mogao Caves", "Longmen Grottoes"], tier: "medium" },
  { id: "leshan", wiki: "Leshan Giant Buddha", answer: "Sichuan, China", cityDecoys: ["Yunnan, China", "Henan, China", "Gansu, China"], landmark: "Leshan Giant Buddha", lmDecoys: ["Tian Tan Buddha", "Spring Temple Buddha", "Ushiku Daibutsu"], tier: "hard" },
  { id: "zhangjiajie", wiki: "Zhangjiajie National Forest Park", answer: "Hunan, China", cityDecoys: ["Guilin, China", "Guizhou, China", "Sapa, Vietnam"], landmark: "Zhangjiajie", lmDecoys: ["Guilin Karsts", "Huangshan", "Halong Bay"], tier: "hard" },
  { id: "halongbay", wiki: "Hạ Long Bay", answer: "Quảng Ninh, Vietnam", cityDecoys: ["Krabi, Thailand", "Palawan, Philippines", "Guilin, China"], landmark: "Ha Long Bay", lmDecoys: ["Phang Nga Bay", "El Nido", "Guilin"], tier: "medium" },
  { id: "gyeongbokgung", wiki: "Gyeongbokgung", answer: "Seoul, South Korea", cityDecoys: ["Kyoto, Japan", "Beijing, China", "Busan, South Korea"], landmark: "Gyeongbokgung Palace", lmDecoys: ["Forbidden City", "Changdeokgung", "Nijō Castle"], tier: "hard" },
  { id: "pamukkale", wiki: "Pamukkale", answer: "Denizli, Turkey", cityDecoys: ["Antalya, Turkey", "Cappadocia, Turkey", "Yellowstone, USA"], landmark: "Pamukkale", lmDecoys: ["Mammoth Hot Springs", "Huanglong", "Badab-e Surt"], tier: "hard" },
  { id: "cappadocia", wiki: "Cappadocia", answer: "Nevşehir, Turkey", cityDecoys: ["Konya, Turkey", "Meteora, Greece", "Petra, Jordan"], landmark: "Cappadocia", lmDecoys: ["Meteora", "Bryce Canyon", "Göreme"], tier: "medium" },
  { id: "abusimbel", wiki: "Abu Simbel", answer: "Aswan, Egypt", cityDecoys: ["Luxor, Egypt", "Khartoum, Sudan", "Cairo, Egypt"], landmark: "Abu Simbel", lmDecoys: ["Karnak Temple", "Temple of Luxor", "Valley of the Kings"], tier: "hard" },
  { id: "registan", wiki: "Registan", answer: "Samarkand, Uzbekistan", cityDecoys: ["Bukhara, Uzbekistan", "Isfahan, Iran", "Mashhad, Iran"], landmark: "Registan", lmDecoys: ["Imam Square", "Bibi-Khanym Mosque", "Kalyan Minaret"], tier: "hard" },
  { id: "moraine", wiki: "Moraine Lake", answer: "Alberta, Canada", cityDecoys: ["British Columbia, Canada", "Montana, USA", "Patagonia, Argentina"], landmark: "Moraine Lake", lmDecoys: ["Lake Louise", "Peyto Lake", "Lake Bled"], tier: "hard" },
  { id: "plitvice", wiki: "Plitvice Lakes National Park", answer: "Plitvice, Croatia", cityDecoys: ["Bled, Slovenia", "Bohinj, Slovenia", "Bavaria, Germany"], landmark: "Plitvice Lakes", lmDecoys: ["Krka Falls", "Lake Bled", "Kravice Falls"], tier: "hard" },
  { id: "neuschwanstein2", wiki: "Hohenzollern Castle", answer: "Baden-Württemberg, Germany", cityDecoys: ["Bavaria, Germany", "Tyrol, Austria", "Bohemia, Czechia"], landmark: "Hohenzollern Castle", lmDecoys: ["Neuschwanstein", "Hohenwerfen Castle", "Eltz Castle"], tier: "hard" },
];

// Use the MediaWiki pageimages API (not the REST summary): it returns a pre-rendered, guaranteed-valid
// thumbnail URL near the requested size. Arbitrary upload.wikimedia.org thumb widths 400 unpredictably
// because only certain bucket sizes are allowed per file. `redirects=1` resolves title redirects.
async function fetchImageUrl(wiki) {
  const api =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1` +
    `&prop=pageimages&piprop=thumbnail&pithumbsize=1024&titles=${encodeURIComponent(wiki)}`;
  const res = await fetch(api, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const j = await res.json();
  const pages = j.query?.pages ?? {};
  const page = pages[Object.keys(pages)[0]];
  const src = page?.thumbnail?.source;
  if (!src) throw new Error("no thumbnail");
  return src;
}

async function download(url, dest) {
  // Wikimedia rate-limits bursts (429). Retry with backoff so a fast loop doesn't drop entries.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`img ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    return;
  }
  throw new Error("img 429 (rate-limited after retries)");
}

function isValidImage(path) {
  if (!existsSync(path)) return false;
  if (statSync(path).size < 8000) return false; // reject tiny/error bodies
  const buf = readFileSync(path).subarray(0, 4);
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  return jpeg || png;
}

async function main() {
  const geo = JSON.parse(readFileSync(GEO_JSON, "utf8"));
  const landmarks = JSON.parse(readFileSync(LM_JSON, "utf8"));
  const geoIds = new Set(geo.map((e) => e.id));
  const lmById = new Map(landmarks.map((l) => [l.id, l]));

  // 1) Tier the existing entries (in place).
  for (const e of geo) e.tier = EXISTING_TIERS[e.id] ?? e.tier ?? "medium";
  for (const l of landmarks) l.tier = EXISTING_TIERS[l.id] ?? l.tier ?? "medium";

  // 2) Fetch + append the new entries.
  const added = [];
  const failed = [];
  for (const n of NEW) {
    if (geoIds.has(n.id)) { console.log(`skip (exists): ${n.id}`); continue; }
    const dest = join(IMG_DIR, `${n.id}.jpg`);
    try {
      const url = await fetchImageUrl(n.wiki);
      await download(url, dest);
      if (!isValidImage(dest)) throw new Error("invalid image body");
      geo.push({
        id: n.id, answer: n.answer, decoys: n.cityDecoys,
        image: `/geo/${n.id}.jpg`, source: url, tier: n.tier,
      });
      if (!lmById.has(n.id)) {
        landmarks.push({ id: n.id, landmark: n.landmark, decoys: n.lmDecoys, tier: n.tier });
      }
      added.push(n.id);
      console.log(`ok: ${n.id}  (${n.tier})`);
    } catch (err) {
      failed.push(`${n.id}: ${err.message}`);
      console.log(`FAIL: ${n.id} -> ${err.message}`);
    }
    await sleep(400); // be polite to Wikimedia; avoids 429 bursts
  }

  writeFileSync(GEO_JSON, JSON.stringify(geo, null, 2) + "\n");
  writeFileSync(LM_JSON, JSON.stringify(landmarks, null, 2) + "\n");

  console.log(`\nAdded ${added.length} new locations. geo.json now ${geo.length}, landmarks ${landmarks.length}.`);
  if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.join("\n  ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
