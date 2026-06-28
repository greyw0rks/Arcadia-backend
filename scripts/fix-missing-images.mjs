// Fixes missing images in logos.json, geo.json, and movies.json by re-fetching
// stale source URLs via the Wikipedia API using known article titles.
// Run: node scripts/fix-missing-images.mjs
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "ArcadiaGame/1.0 (educational quiz)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Known Wikipedia article titles for entries whose auto-generated source URLs went 404.
const LOGO_ARTICLES = {
  lamborghini: "Lamborghini", porsche: "Porsche", rolls_royce: "Rolls-Royce_Motor_Cars",
  bentley: "Bentley_Motors", maserati: "Maserati", alfromeo: "Alfa_Romeo",
  fiat: "Fiat_Automobiles", nissan: "Nissan", hyundai: "Hyundai_Motor_Company",
  kia: "Kia_(brand)", mazda: "Mazda", subaru: "Subaru", mitsubishi: "Mitsubishi_Motors",
  volvo: "Volvo_Cars", land_rover: "Land_Rover", jaguar: "Jaguar_Cars",
  jeep: "Jeep", chevrolet: "Chevrolet", dodge: "Dodge_(brand)",
  cadillac: "Cadillac_(automobile)", lexus: "Lexus", infiniti: "Infiniti",
  acura: "Acura", peugeot: "Peugeot", renault: "Renault", skoda: "Škoda_Auto",
  bugatti: "Bugatti_Automobiles", nvidia: "Nvidia", amd: "AMD",
  qualcomm: "Qualcomm", oracle: "Oracle_Corporation", cisco: "Cisco",
  hp: "HP_Inc.", dell: "Dell_Technologies", lenovo: "Lenovo",
  asus: "Asus", acer: "Acer_Inc.", lg: "LG_Electronics",
  panasonic: "Panasonic", philips: "Philips", siemens: "Siemens",
  adobe: "Adobe_Inc.", salesforce: "Salesforce", zoom: "Zoom_Video_Communications",
  slack: "Slack_(software)", dropbox: "Dropbox_(service)", shopify: "Shopify",
  stripe: "Stripe,_Inc.", xiaomi: "Xiaomi", huawei: "Huawei",
  snapchat: "Snapchat", tiktok: "TikTok", pinterest: "Pinterest",
  discord: "Discord_(software)", twitch: "Twitch_(service)", reddit: "Reddit",
  wendys: "Wendy's", tacobell: "Taco_Bell", chipotle: "Chipotle_Mexican_Grill",
  dominos: "Domino's_Pizza", dunkin: "Dunkin'", pizzahut: "Pizza_Hut",
  redbull: "Red_Bull", monster: "Monster_Beverage", heineken: "Heineken",
  budweiser: "Budweiser", corona: "Corona_(beer)", guinness: "Guinness",
  nestle: "Nestlé", kraft: "Kraft_Heinz", fiveguys: "Five_Guys",
  shakeshack: "Shake_Shack", popeyes: "Popeyes", zara: "Zara_(retailer)",
  hm: "H&M", uniqlo: "Uniqlo", gap: "Gap_(retailer)", levis: "Levi_Strauss_%26_Co.",
  ralph_lauren: "Ralph_Lauren_Corporation", tommy_hilfiger: "Tommy_Hilfiger",
  calvin_klein: "Calvin_Klein", prada: "Prada", versace: "Versace",
  burberry: "Burberry", dior: "Dior", balenciaga: "Balenciaga",
  ysl: "Yves_Saint_Laurent_(brand)", hermes: "Hermès", tiffany: "Tiffany_%26_Co.",
  target: "Target_Corporation", walmart: "Walmart", costco: "Costco",
  ebay: "EBay", etsy: "Etsy", alibaba: "Alibaba_Group",
  amex: "American_Express", jpmorgan: "JPMorgan_Chase",
  hsbc: "HSBC", goldman: "Goldman_Sachs", coinbase: "Coinbase",
  binance: "Binance", emirates: "Emirates_(airline)",
  singapore_air: "Singapore_Airlines", lufthansa: "Lufthansa",
  british_airways: "British_Airways", air_france: "Air_France",
  qatar_airways: "Qatar_Airways", turkish_airlines: "Turkish_Airlines",
  delta: "Delta_Air_Lines", united: "United_Airlines",
  southwest: "Southwest_Airlines", ryanair: "Ryanair",
  marriott: "Marriott_International", hilton: "Hilton_Worldwide",
  netflix: "Netflix", hbo: "HBO", hulu: "Hulu", disney_plus: "Disney+",
  espn: "ESPN", cnn: "CNN", bbc: "BBC",
  warner_bros: "Warner_Bros.", universal: "Universal_Pictures",
  paramount: "Paramount_Pictures", playstation: "PlayStation",
  xbox: "Xbox", nintendo: "Nintendo", steam: "Steam_(service)",
  ea: "Electronic_Arts", ubisoft: "Ubisoft", activision: "Activision",
  verizon: "Verizon_Communications", att: "AT%26T", tmobile: "T-Mobile_US",
  vodafone: "Vodafone", real_madrid: "Real_Madrid_CF",
  barcelona: "FC_Barcelona", man_utd: "Manchester_United_F.C.",
  man_city: "Manchester_City_F.C.", liverpool: "Liverpool_F.C.",
  chelsea: "Chelsea_F.C.", arsenal: "Arsenal_F.C.",
  bayern: "FC_Bayern_Munich", juventus: "Juventus_F.C.",
  psg: "Paris_Saint-Germain_F.C.", acmilan: "A.C._Milan",
  intermilan: "Inter_Milan", lakers: "Los_Angeles_Lakers",
  bulls: "Chicago_Bulls", warriors: "Golden_State_Warriors",
  cowboys: "Dallas_Cowboys", patriots: "New_England_Patriots",
  yankees: "New_York_Yankees", spotify: "Spotify",
  uber_eats: "Uber_Eats", doordash: "DoorDash",
  booking: "Booking.com", expedia: "Expedia_Group",
  tripadvisor: "Tripadvisor", under_armour: "Under_Armour",
  new_balance: "New_Balance", reebok: "Reebok", converse: "Converse_(shoe_company)",
  vans: "Vans_(brand)", timberland: "Timberland_(company)",
  north_face: "The_North_Face", patagonia: "Patagonia,_Inc.",
  columbia: "Columbia_Sportswear", supreme: "Supreme_(brand)",
  champion: "Champion_(sportswear)", caterpillar: "Caterpillar_Inc.",
  john_deere: "John_Deere", bosch: "Robert_Bosch_GmbH",
  "3m": "3M", pfizer: "Pfizer",
  johnson: "Johnson_%26_Johnson", pg: "Procter_%26_Gamble",
  unilever: "Unilever", colgate: "Colgate-Palmolive",
  nasa: "NASA", spacex: "SpaceX",
  red_cross: "International_Red_Cross_and_Red_Crescent_Movement",
  unicef: "UNICEF",
};

// Wikipedia article titles for geo entries that need refreshing.
const GEO_ARTICLES = {};

// Wikipedia article titles for movie entries.
const MOVIE_ARTICLES = {
  placeholder1: "The_Matrix", placeholder2: "Jurassic_Park_(film)",
  placeholder3: "Star_Wars_(film)", placeholder4: "The_Godfather",
  placeholder5: "Pulp_Fiction",
};

function isValidImage(path) {
  if (!existsSync(path)) return false;
  if (statSync(path).size < 5000) return false;
  const buf = readFileSync(path).subarray(0, 4);
  return (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
}

async function wikiThumb(article) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1`
    + `&prop=pageimages&piprop=thumbnail&pithumbsize=960`
    + `&titles=${encodeURIComponent(article)}`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) return null;
      const j = await res.json();
      const pages = j.query?.pages ?? {};
      const page = pages[Object.keys(pages)[0]];
      return page?.thumbnail?.source ?? null;
    } catch { await sleep(2000); }
  }
  return null;
}

async function download(src, dest) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(src, { headers: { "user-agent": UA } });
      if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      return true;
    } catch (e) {
      if (i === 2) return false;
      await sleep(2000 * (i + 1));
    }
  }
  return false;
}

async function fixBank(jsonPath, publicDir, articleMap) {
  mkdirSync(publicDir, { recursive: true });
  const bank = JSON.parse(readFileSync(jsonPath, "utf8"));
  let fixed = 0, failed = 0;

  for (const entry of bank) {
    if (!entry.image) continue;
    const dest = join(ROOT, "public", entry.image);
    if (isValidImage(dest)) continue;  // already good

    // Try existing source URL first
    if (entry.source) {
      const ok = await download(entry.source, dest);
      await sleep(1200);
      if (ok && isValidImage(dest)) {
        fixed++;
        console.log(`  ok (existing URL): ${entry.id}`);
        continue;
      }
    }

    // Look up the article title (from map or fallback to answer/id)
    const article = articleMap[entry.id] ?? entry.answer ?? entry.id;
    await sleep(1500);
    const src = await wikiThumb(article);
    await sleep(1200);
    if (!src) {
      console.log(`  SKIP (no thumb): ${entry.id}`);
      failed++;
      continue;
    }
    const ok = await download(src, dest);
    await sleep(1200);
    if (ok && isValidImage(dest)) {
      entry.source = src;
      fixed++;
      console.log(`  fixed: ${entry.id}`);
    } else {
      console.log(`  FAIL: ${entry.id}`);
      failed++;
    }
  }

  writeFileSync(jsonPath, JSON.stringify(bank, null, 2) + "\n");
  const onDisk = readdirSync(publicDir).length;
  console.log(`  ${fixed} fixed, ${failed} failed — ${onDisk} total on disk`);
}

const { readdirSync } = await import("node:fs");

console.log("=== Fixing Logos ===");
await fixBank(join(ROOT, "data/logos.json"), join(ROOT, "public/logos"), LOGO_ARTICLES);

console.log("\n=== Fixing Geo ===");
await fixBank(join(ROOT, "data/geo.json"), join(ROOT, "public/geo"), GEO_ARTICLES);

console.log("\n=== Fixing Movies ===");
await fixBank(join(ROOT, "data/movies.json"), join(ROOT, "public/movies"), MOVIE_ARTICLES);

console.log("\nDone.");
