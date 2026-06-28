// Compresses all jpg/png images in the given directories using sharp.
// Target: max 1280px wide, JPEG quality 75 (logos 85 to preserve crisp edges).
// PNGs are converted to JPEG unless they have transparency.

import sharp from "sharp";
import fs from "fs";
import path from "path";

const DIRS = [
  { dir: "public/geo",    jpgQ: 75, maxW: 1280 },
  { dir: "public/logos",  jpgQ: 85, maxW: 800  },
  { dir: "public/movies", jpgQ: 75, maxW: 1280 },
];

async function hasAlpha(file) {
  try {
    const meta = await sharp(file).metadata();
    return meta.channels === 4 || meta.hasAlpha;
  } catch {
    return false;
  }
}

async function compressDir({ dir, jpgQ, maxW }) {
  const abs = path.resolve(dir);
  const files = fs.readdirSync(abs).filter(f => /\.(jpe?g|png)$/i.test(f));
  let saved = 0;
  let count = 0;

  for (const f of files) {
    const src = path.join(abs, f);
    const ext = path.extname(f).toLowerCase();
    const isPng = ext === ".png";
    const sizeBefore = fs.statSync(src).size;

    const tmp = src + ".tmp";
    try {
      const img = sharp(src).resize({ width: maxW, withoutEnlargement: true });

      if (isPng && await hasAlpha(src)) {
        // Keep as PNG, just resize
        await img.png({ compressionLevel: 9, effort: 10 }).toFile(tmp);
      } else {
        // Convert/recompress as JPEG
        const outFile = isPng ? src.replace(/\.png$/i, ".jpg") : src;
        await img.jpeg({ quality: jpgQ, mozjpeg: true }).toFile(tmp);
        fs.renameSync(tmp, outFile);
        if (isPng && outFile !== src) fs.unlinkSync(src); // remove old .png
        const sizeAfter = fs.statSync(outFile).size;
        saved += sizeBefore - sizeAfter;
        count++;
        continue;
      }

      fs.renameSync(tmp, src);
      const sizeAfter = fs.statSync(src).size;
      saved += sizeBefore - sizeAfter;
      count++;
    } catch (e) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      console.error(`  SKIP ${f}: ${e.message}`);
    }
  }

  console.log(`${dir}: ${count} files, saved ${(saved / 1024 / 1024).toFixed(1)} MB`);
  return { savedPng: [], renamedPng: [] };
}

for (const cfg of DIRS) {
  console.log(`Compressing ${cfg.dir}...`);
  await compressDir(cfg);
}

console.log("Done.");
