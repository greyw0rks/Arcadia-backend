// Downloads all images referenced in logos.json, geo.json, and movies.json that are missing locally.
// For entries whose stored source URL returns 404, re-fetches the current Wikipedia thumbnail.
// Run from arcadia-backend: node scripts/download-images.mjs
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "ArcadiaGame/1.0 (educational quiz; greyw0rks@github)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isValidImage(path) {
  if (!existsSync(path)) return false;
  if (statSync(path).size < 5000) return false;
  const buf = readFileSync(path).subarray(0, 4);
  return (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
}

// Fetch the Wikipedia thumbnail URL for a search term (brand/landmark name).
// Returns null if no thumbnail found.
async function refreshWikiThumb(searchTerm) {
  const q = encodeURIComponent(searchTerm);
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1`
    + `&prop=pageimages&piprop=thumbnail&pithumbsize=960`
    + `&generator=search&gsrsearch=${q}&gsrlimit=1`;
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429) return null;
    if (!res.ok) return null;
    const j = await res.json();
    const pages = j.query?.pages ?? {};
    const page = pages[Object.keys(pages)[0]];
    return page?.thumbnail?.source ?? null;
  } catch { return null; }
}

async function downloadFile(url, dest) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get("retry-after") ?? "5") * 1000;
        console.log(`    429 rate-limit, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (res.status === 404) return "404";
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      return "ok";
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
  return "fail";
}

async function processBank(jsonPath, publicDir, nameField) {
  mkdirSync(publicDir, { recursive: true });
  const bank = JSON.parse(readFileSync(jsonPath, "utf8"));
  let downloaded = 0, skipped = 0, refreshed = 0, failed = 0;
  let changed = false;

  for (const entry of bank) {
    if (!entry.image) { skipped++; continue; }
    const dest = join(ROOT, "public", entry.image);

    if (isValidImage(dest)) { skipped++; continue; }

    // Try existing source URL first
    if (entry.source) {
      const status = await downloadFile(entry.source, dest);
      await sleep(1500); // Wikimedia rate-limit policy: ≥1s between requests
      if (status === "ok" && isValidImage(dest)) {
        downloaded++;
        process.stdout.write(`  ok: ${entry.id}\n`);
        continue;
      }
      if (status === "404") {
        process.stdout.write(`  404 (stale), refreshing: ${entry.id}\n`);
      }
    }

    // Source URL is missing or stale — ask Wikipedia for the current thumbnail
    const name = entry[nameField] ?? entry.answer ?? entry.id;
    await sleep(2000);
    const freshUrl = await refreshWikiThumb(name);
    await sleep(1500);
    if (!freshUrl) {
      process.stdout.write(`  SKIP (no thumbnail): ${entry.id}\n`);
      failed++;
      continue;
    }
    const status2 = await downloadFile(freshUrl, dest);
    await sleep(1500);
    if (status2 === "ok" && isValidImage(dest)) {
      entry.source = freshUrl;
      changed = true;
      refreshed++;
      process.stdout.write(`  refreshed: ${entry.id}\n`);
    } else {
      process.stdout.write(`  FAIL: ${entry.id}\n`);
      failed++;
    }
  }

  if (changed) {
    writeFileSync(jsonPath, JSON.stringify(bank, null, 2) + "\n");
    console.log(`  (updated ${jsonPath} with refreshed source URLs)`);
  }

  return { total: bank.length, downloaded, refreshed, skipped, failed };
}

console.log("=== Logos ===");
const logos = await processBank(join(ROOT, "data/logos.json"), join(ROOT, "public/logos"), "answer");
console.log(`Logos: ${logos.downloaded} downloaded, ${logos.refreshed} URL-refreshed, ${logos.skipped} already present, ${logos.failed} failed`);
console.log(`Total logo images on disk: ${(await import("node:fs")).readdirSync(join(ROOT, "public/logos")).length}\n`);

console.log("=== Geo/Landmarks ===");
const geo = await processBank(join(ROOT, "data/geo.json"), join(ROOT, "public/geo"), "answer");
console.log(`Geo: ${geo.downloaded} downloaded, ${geo.refreshed} URL-refreshed, ${geo.skipped} already present, ${geo.failed} failed`);
console.log(`Total geo images on disk: ${(await import("node:fs")).readdirSync(join(ROOT, "public/geo")).length}\n`);

console.log("=== Movies ===");
const movies = await processBank(join(ROOT, "data/movies.json"), join(ROOT, "public/movies"), "answer");
console.log(`Movies: ${movies.downloaded} downloaded, ${movies.refreshed} URL-refreshed, ${movies.skipped} already present, ${movies.failed} failed`);
console.log(`Total movie images on disk: ${(await import("node:fs")).readdirSync(join(ROOT, "public/movies")).length}\n`);

console.log("All done.");
