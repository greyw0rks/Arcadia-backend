// Generates the logo quiz dataset: downloads brand logos from Wikimedia Commons into public/logos/
// and writes data/logos.json. Re-run to refresh.
//   node scripts/gen-logos.mjs
import { writeFile, mkdir, readFile, access } from "fs/promises";

const UA = { "User-Agent": "QuizArcade/0.1 (Proof-of-Ship demo)" };

const LOGOS = [
  { id: "apple", article: "Apple_Inc.", answer: "Apple", decoys: ["Microsoft", "Samsung", "Google"] },
  { id: "google", article: "Google", answer: "Google", decoys: ["Yahoo", "Bing", "DuckDuckGo"] },
  { id: "microsoft", article: "Microsoft", answer: "Microsoft", decoys: ["IBM", "Oracle", "Intel"] },
  { id: "amazon", article: "Amazon_(company)", answer: "Amazon", decoys: ["eBay", "Alibaba", "Walmart"] },
  { id: "meta", article: "Meta_Platforms", answer: "Meta (Facebook)", decoys: ["Twitter", "Snapchat", "TikTok"] },
  { id: "netflix", article: "Netflix", answer: "Netflix", decoys: ["Hulu", "Disney+", "HBO"] },
  { id: "spotify", article: "Spotify", answer: "Spotify", decoys: ["Apple Music", "Pandora", "SoundCloud"] },
  { id: "tesla", article: "Tesla,_Inc.", answer: "Tesla", decoys: ["Ford", "BMW", "Toyota"] },
  { id: "nike", article: "Nike,_Inc.", answer: "Nike", decoys: ["Adidas", "Puma", "Reebok"] },
  { id: "mcdonalds", article: "McDonald's", answer: "McDonald's", decoys: ["Burger King", "KFC", "Wendy's"] },
  { id: "cocacola", article: "The_Coca-Cola_Company", answer: "Coca-Cola", decoys: ["Pepsi", "Dr Pepper", "Sprite"] },
  { id: "starbucks", article: "Starbucks", answer: "Starbucks", decoys: ["Dunkin'", "Costa Coffee", "Peet's"] },
  // --- Expanded set ---
  { id: "adidas", article: "Adidas", answer: "Adidas", decoys: ["Nike", "Puma", "Under Armour"] },
  { id: "puma", article: "Puma_(brand)", answer: "Puma", decoys: ["Adidas", "Reebok", "Fila"] },
  { id: "pepsi", article: "Pepsi", answer: "Pepsi", decoys: ["Coca-Cola", "Fanta", "7 Up"] },
  { id: "intel", article: "Intel", answer: "Intel", decoys: ["AMD", "Nvidia", "Qualcomm"] },
  { id: "ibm", article: "IBM", answer: "IBM", decoys: ["Oracle", "SAP", "Dell"] },
  { id: "oracle", article: "Oracle_Corporation", answer: "Oracle", decoys: ["IBM", "SAP", "Salesforce"] },
  { id: "samsung", article: "Samsung", answer: "Samsung", decoys: ["LG", "Sony", "Panasonic"] },
  { id: "sony", article: "Sony", answer: "Sony", decoys: ["Panasonic", "Toshiba", "Sharp"] },
  { id: "toyota", article: "Toyota", answer: "Toyota", decoys: ["Honda", "Nissan", "Mazda"] },
  { id: "honda", article: "Honda", answer: "Honda", decoys: ["Toyota", "Yamaha", "Suzuki"] },
  { id: "bmw", article: "BMW", answer: "BMW", decoys: ["Audi", "Mercedes-Benz", "Volkswagen"] },
  { id: "mercedes", article: "Mercedes-Benz", answer: "Mercedes-Benz", decoys: ["BMW", "Audi", "Lexus"] },
  { id: "audi", article: "Audi", answer: "Audi", decoys: ["BMW", "Volkswagen", "Porsche"] },
  { id: "volkswagen", article: "Volkswagen", answer: "Volkswagen", decoys: ["Audi", "Škoda", "Opel"] },
  { id: "ferrari", article: "Ferrari", answer: "Ferrari", decoys: ["Lamborghini", "Maserati", "Porsche"] },
  { id: "ford", article: "Ford_Motor_Company", answer: "Ford", decoys: ["Chevrolet", "Dodge", "Chrysler"] },
  { id: "disney", article: "The_Walt_Disney_Company", answer: "Disney", decoys: ["Warner Bros.", "Universal", "Paramount"] },
  { id: "youtube", article: "YouTube", answer: "YouTube", decoys: ["Vimeo", "Twitch", "Dailymotion"] },
  { id: "instagram", article: "Instagram", answer: "Instagram", decoys: ["Snapchat", "Pinterest", "Flickr"] },
  { id: "twitter", article: "Twitter", answer: "Twitter (X)", decoys: ["Threads", "Mastodon", "Bluesky"] },
  { id: "linkedin", article: "LinkedIn", answer: "LinkedIn", decoys: ["Indeed", "Glassdoor", "Xing"] },
  { id: "tiktok", article: "TikTok", answer: "TikTok", decoys: ["Snapchat", "Triller", "Vine"] },
  { id: "whatsapp", article: "WhatsApp", answer: "WhatsApp", decoys: ["Telegram", "Signal", "Viber"] },
  { id: "uber", article: "Uber", answer: "Uber", decoys: ["Lyft", "Grab", "Bolt"] },
  { id: "airbnb", article: "Airbnb", answer: "Airbnb", decoys: ["Booking.com", "Vrbo", "Expedia"] },
  { id: "paypal", article: "PayPal", answer: "PayPal", decoys: ["Stripe", "Venmo", "Square"] },
  { id: "visa", article: "Visa_Inc.", answer: "Visa", decoys: ["Mastercard", "American Express", "Discover"] },
  { id: "mastercard", article: "Mastercard", answer: "Mastercard", decoys: ["Visa", "American Express", "Maestro"] },
  { id: "kfc", article: "KFC", answer: "KFC", decoys: ["Popeyes", "Chick-fil-A", "Church's Chicken"] },
  { id: "burgerking", article: "Burger_King", answer: "Burger King", decoys: ["McDonald's", "Wendy's", "Hardee's"] },
  { id: "subway", article: "Subway_(restaurant)", answer: "Subway", decoys: ["Quiznos", "Jimmy John's", "Jersey Mike's"] },
  { id: "redbull", article: "Red_Bull", answer: "Red Bull", decoys: ["Monster", "Rockstar", "Gatorade"] },
  { id: "lego", article: "Lego", answer: "Lego", decoys: ["Playmobil", "Mega Bloks", "K'Nex"] },
  { id: "ikea", article: "IKEA", answer: "IKEA", decoys: ["Wayfair", "Ashley", "West Elm"] },
  { id: "gucci", article: "Gucci", answer: "Gucci", decoys: ["Prada", "Versace", "Louis Vuitton"] },
  { id: "louisvuitton", article: "Louis_Vuitton", answer: "Louis Vuitton", decoys: ["Gucci", "Chanel", "Hermès"] },
  { id: "rolex", article: "Rolex", answer: "Rolex", decoys: ["Omega", "TAG Heuer", "Patek Philippe"] },
  { id: "shell", article: "Shell_plc", answer: "Shell", decoys: ["BP", "ExxonMobil", "Chevron"] },
  { id: "fedex", article: "FedEx", answer: "FedEx", decoys: ["UPS", "DHL", "USPS"] },
  { id: "ups", article: "United_Parcel_Service", answer: "UPS", decoys: ["FedEx", "DHL", "USPS"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function thumbUrl(article) {
  const api =
    "https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail" +
    `&pithumbsize=512&format=json&titles=${encodeURIComponent(article)}`;
  // Retry on rate-limit (the API returns an HTML error page, not JSON, when throttled).
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(api, { headers: UA });
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      const page = Object.values(j.query.pages)[0];
      return page?.thumbnail?.source ?? null;
    } catch {
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error("non-JSON after retries (rate-limited)");
}

function isRealImage(buf) {
  return buf.length > 5_000 && (buf[0] === 0xff || buf[0] === 0x89);
}

async function downloadValid(src) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const buf = Buffer.from(await (await fetch(src, { headers: UA })).arrayBuffer());
    if (isRealImage(buf)) return buf;
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

await mkdir("public/logos", { recursive: true });

// Resume support: keep entries already downloaded so re-running only fetches what's missing.
const exists = async (p) => access(p).then(() => true).catch(() => false);
let prev = [];
try {
  prev = JSON.parse(await readFile("data/logos.json", "utf8"));
} catch {
  /* first run */
}
const byId = new Map(prev.map((e) => [e.id, e]));

for (const L of LOGOS) {
  const existing = byId.get(L.id);
  if (existing && (await exists(`public${existing.image}`))) {
    console.log("skip (have):", L.id);
    continue;
  }
  try {
    const src = await thumbUrl(L.article);
    if (!src) {
      console.log("SKIP (no image):", L.id);
      await sleep(1800);
      continue;
    }
    const buf = await downloadValid(src);
    if (!buf) {
      console.log("SKIP (download failed):", L.id);
      await sleep(1800);
      continue;
    }
    const ext = src.includes(".png") ? "png" : "jpg";
    const file = `${L.id}.${ext}`;
    await writeFile(`public/logos/${file}`, buf);
    byId.set(L.id, { id: L.id, answer: L.answer, decoys: L.decoys, image: `/logos/${file}`, source: src });
    console.log("saved", file, buf.length, "bytes");
  } catch (e) {
    console.log("ERROR", L.id, e.message);
  }
  await sleep(1800);
}
// Preserve LOGOS order in the output.
const out = LOGOS.map((L) => byId.get(L.id)).filter(Boolean);
await writeFile("data/logos.json", JSON.stringify(out, null, 2));
console.log(`\nWrote data/logos.json with ${out.length} logos.`);
