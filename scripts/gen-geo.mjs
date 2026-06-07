// One-shot dataset generator for the GeoGuess module. Downloads freely-licensed images from Wikimedia
// (via the MediaWiki pageimages API) into public/geo/ and writes data/geo.json. Re-run to refresh.
//   node scripts/gen-geo.mjs
import { writeFile, mkdir, readFile, access } from "fs/promises";

const UA = { "User-Agent": "QuizArcade/0.1 (Proof-of-Ship demo)" };

const LOCATIONS = [
  { id: "eiffel", article: "Eiffel_Tower", answer: "Paris, France", decoys: ["London, UK", "Madrid, Spain", "Rome, Italy"] },
  { id: "colosseum", article: "Colosseum", answer: "Rome, Italy", decoys: ["Athens, Greece", "Lisbon, Portugal", "Vienna, Austria"] },
  { id: "opera", article: "Sydney_Opera_House", answer: "Sydney, Australia", decoys: ["Auckland, New Zealand", "Cape Town, South Africa", "Vancouver, Canada"] },
  { id: "taj", article: "Taj_Mahal", answer: "Agra, India", decoys: ["Jaipur, India", "Lahore, Pakistan", "Dhaka, Bangladesh"] },
  { id: "ggbridge", article: "Golden_Gate_Bridge", answer: "San Francisco, USA", decoys: ["Seattle, USA", "Vancouver, Canada", "Lisbon, Portugal"] },
  { id: "liberty", article: "Statue_of_Liberty", answer: "New York, USA", decoys: ["Boston, USA", "Chicago, USA", "Philadelphia, USA"] },
  { id: "bigben", article: "Big_Ben", answer: "London, UK", decoys: ["Dublin, Ireland", "Edinburgh, UK", "Brussels, Belgium"] },
  { id: "redeemer", article: "Christ_the_Redeemer_(statue)", answer: "Rio de Janeiro, Brazil", decoys: ["Lima, Peru", "Bogota, Colombia", "Buenos Aires, Argentina"] },
  { id: "brandenburg", article: "Brandenburg_Gate", answer: "Berlin, Germany", decoys: ["Munich, Germany", "Vienna, Austria", "Warsaw, Poland"] },
  { id: "burj", article: "Burj_Khalifa", answer: "Dubai, UAE", decoys: ["Doha, Qatar", "Abu Dhabi, UAE", "Riyadh, Saudi Arabia"] },
  { id: "petra", article: "Petra", answer: "Petra, Jordan", decoys: ["Luxor, Egypt", "Jerusalem, Israel", "Beirut, Lebanon"] },
  { id: "machu", article: "Machu_Picchu", answer: "Cusco, Peru", decoys: ["Quito, Ecuador", "La Paz, Bolivia", "Bogota, Colombia"] },
  // --- Expanded set ---
  { id: "pisa", article: "Leaning_Tower_of_Pisa", answer: "Pisa, Italy", decoys: ["Bologna, Italy", "Florence, Italy", "Seville, Spain"] },
  { id: "sagrada", article: "Sagrada_Família", answer: "Barcelona, Spain", decoys: ["Valencia, Spain", "Milan, Italy", "Cologne, Germany"] },
  { id: "acropolis", article: "Acropolis_of_Athens", answer: "Athens, Greece", decoys: ["Rome, Italy", "Istanbul, Turkey", "Tirana, Albania"] },
  { id: "kremlin", article: "Saint_Basil's_Cathedral", answer: "Moscow, Russia", decoys: ["Kyiv, Ukraine", "Minsk, Belarus", "Sofia, Bulgaria"] },
  { id: "forbidden", article: "Forbidden_City", answer: "Beijing, China", decoys: ["Xi'an, China", "Seoul, South Korea", "Kyoto, Japan"] },
  { id: "greatwall", article: "Great_Wall_of_China", answer: "Beijing, China", decoys: ["Pyongyang, North Korea", "Ulaanbaatar, Mongolia", "Xi'an, China"] },
  { id: "fuji", article: "Mount_Fuji", answer: "Honshu, Japan", decoys: ["Jeju, South Korea", "Taiwan", "Luzon, Philippines"] },
  { id: "senso", article: "Sensō-ji", answer: "Tokyo, Japan", decoys: ["Kyoto, Japan", "Osaka, Japan", "Seoul, South Korea"] },
  { id: "angkor", article: "Angkor_Wat", answer: "Siem Reap, Cambodia", decoys: ["Bangkok, Thailand", "Bagan, Myanmar", "Luang Prabang, Laos"] },
  { id: "marina", article: "Marina_Bay_Sands", answer: "Singapore", decoys: ["Hong Kong", "Kuala Lumpur, Malaysia", "Bangkok, Thailand"] },
  { id: "petronas", article: "Petronas_Towers", answer: "Kuala Lumpur, Malaysia", decoys: ["Singapore", "Jakarta, Indonesia", "Manila, Philippines"] },
  { id: "gizapyramid", article: "Great_Pyramid_of_Giza", answer: "Giza, Egypt", decoys: ["Khartoum, Sudan", "Marrakesh, Morocco", "Petra, Jordan"] },
  { id: "tablemountain", article: "Table_Mountain", answer: "Cape Town, South Africa", decoys: ["Nairobi, Kenya", "Windhoek, Namibia", "Rio de Janeiro, Brazil"] },
  { id: "neuschwanstein", article: "Neuschwanstein_Castle", answer: "Bavaria, Germany", decoys: ["Salzburg, Austria", "Lucerne, Switzerland", "Loire Valley, France"] },
  { id: "stbasil", article: "Red_Square", answer: "Moscow, Russia", decoys: ["Saint Petersburg, Russia", "Warsaw, Poland", "Prague, Czechia"] },
  { id: "charlesbridge", article: "Charles_Bridge", answer: "Prague, Czechia", decoys: ["Budapest, Hungary", "Vienna, Austria", "Kraków, Poland"] },
  { id: "atomium", article: "Atomium", answer: "Brussels, Belgium", decoys: ["Amsterdam, Netherlands", "Luxembourg City", "Rotterdam, Netherlands"] },
  { id: "windmills", article: "Kinderdijk", answer: "Kinderdijk, Netherlands", decoys: ["Bruges, Belgium", "Copenhagen, Denmark", "Hamburg, Germany"] },
  { id: "littlemermaid", article: "The_Little_Mermaid_(statue)", answer: "Copenhagen, Denmark", decoys: ["Stockholm, Sweden", "Oslo, Norway", "Helsinki, Finland"] },
  { id: "bluemosque", article: "Sultan_Ahmed_Mosque", answer: "Istanbul, Turkey", decoys: ["Cairo, Egypt", "Tehran, Iran", "Baku, Azerbaijan"] },
  { id: "hagia", article: "Hagia_Sophia", answer: "Istanbul, Turkey", decoys: ["Athens, Greece", "Sofia, Bulgaria", "Yerevan, Armenia"] },
  { id: "burjalarab", article: "Burj_Al_Arab", answer: "Dubai, UAE", decoys: ["Doha, Qatar", "Manama, Bahrain", "Kuwait City, Kuwait"] },
  { id: "westernwall", article: "Western_Wall", answer: "Jerusalem, Israel", decoys: ["Amman, Jordan", "Beirut, Lebanon", "Damascus, Syria"] },
  { id: "chichen", article: "Chichen_Itza", answer: "Yucatán, Mexico", decoys: ["Guatemala City, Guatemala", "Tikal, Guatemala", "Belize City, Belize"] },
  { id: "cn", article: "CN_Tower", answer: "Toronto, Canada", decoys: ["Chicago, USA", "Seattle, USA", "Detroit, USA"] },
  { id: "spaceneedle", article: "Space_Needle", answer: "Seattle, USA", decoys: ["Portland, USA", "Vancouver, Canada", "San Francisco, USA"] },
  { id: "hollywood", article: "Hollywood_Sign", answer: "Los Angeles, USA", decoys: ["San Diego, USA", "Las Vegas, USA", "Phoenix, USA"] },
  { id: "whitehouse", article: "White_House", answer: "Washington, D.C., USA", decoys: ["Philadelphia, USA", "Boston, USA", "Richmond, USA"] },
  { id: "gatewaymo", article: "Gateway_Arch", answer: "St. Louis, USA", decoys: ["Kansas City, USA", "Memphis, USA", "Chicago, USA"] },
  { id: "obelisco", article: "Obelisco_de_Buenos_Aires", answer: "Buenos Aires, Argentina", decoys: ["Montevideo, Uruguay", "Santiago, Chile", "Asunción, Paraguay"] },
  { id: "moai", article: "Moai", answer: "Easter Island, Chile", decoys: ["Fiji", "Samoa", "Tahiti, French Polynesia"] },
  { id: "uluru", article: "Uluru", answer: "Northern Territory, Australia", decoys: ["Outback, South Australia", "Alice Springs, Australia", "Kimberley, Australia"] },
  { id: "skytower", article: "Sky_Tower", answer: "Auckland, New Zealand", decoys: ["Wellington, New Zealand", "Sydney, Australia", "Brisbane, Australia"] },
  { id: "wat", article: "Wat_Arun", answer: "Bangkok, Thailand", decoys: ["Phnom Penh, Cambodia", "Vientiane, Laos", "Yangon, Myanmar"] },
  { id: "gateofindia", article: "Gateway_of_India", answer: "Mumbai, India", decoys: ["Delhi, India", "Chennai, India", "Karachi, Pakistan"] },
  { id: "tianjin", article: "Oriental_Pearl_Tower", answer: "Shanghai, China", decoys: ["Hong Kong", "Guangzhou, China", "Shenzhen, China"] },
  { id: "nblue", article: "Nyhavn", answer: "Copenhagen, Denmark", decoys: ["Bergen, Norway", "Gothenburg, Sweden", "Amsterdam, Netherlands"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function thumbUrl(article) {
  const api =
    "https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail" +
    `&pithumbsize=1024&format=json&titles=${encodeURIComponent(article)}`;
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

// A valid JPEG starts with FF D8 FF and a real 1024px photo is well over 20 KB.
function isRealJpeg(buf) {
  return buf.length > 20_000 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

async function downloadValid(src) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const buf = Buffer.from(await (await fetch(src, { headers: UA })).arrayBuffer());
    if (isRealJpeg(buf)) return buf;
    await sleep(1500 * (attempt + 1)); // back off on rate-limit
  }
  return null;
}

await mkdir("public/geo", { recursive: true });

// Resume support: keep entries already downloaded so re-running only fetches what's missing.
const exists = async (p) => access(p).then(() => true).catch(() => false);
let prev = [];
try {
  prev = JSON.parse(await readFile("data/geo.json", "utf8"));
} catch {
  /* first run */
}
const byId = new Map(prev.map((e) => [e.id, e]));

for (const L of LOCATIONS) {
  const existing = byId.get(L.id);
  if (existing && (await exists(`public/geo/${L.id}.jpg`))) {
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
      console.log("SKIP (download failed/invalid):", L.id);
      await sleep(1800);
      continue;
    }
    const file = `${L.id}.jpg`;
    await writeFile(`public/geo/${file}`, buf);
    byId.set(L.id, { id: L.id, answer: L.answer, decoys: L.decoys, image: `/geo/${file}`, source: src });
    console.log("saved", file, buf.length, "bytes");
  } catch (e) {
    console.log("ERROR", L.id, e.message);
  }
  await sleep(1800); // be polite to the API
}
// Preserve LOCATIONS order in the output.
const out = LOCATIONS.map((L) => byId.get(L.id)).filter(Boolean);
await writeFile("data/geo.json", JSON.stringify(out, null, 2));
console.log(`\nWrote data/geo.json with ${out.length} locations.`);
