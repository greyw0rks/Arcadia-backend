#!/usr/bin/env python3
"""Convert quiz images to WebP and rewrite the data-bank references.

Quiz photos are 1280px wide but render into a 400px-tall box, so they ship far more
pixels than they display. Downscale to 800px (still sharp under the 1.55x extreme-mode
zoom) and re-encode as WebP.
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
DATA = ROOT / "data"

MAX_WIDTH = 800
QUALITY = 80
BANKS = ["geo.json", "logos.json", "movies.json"]


def convert(src: Path) -> tuple[Path, int, int]:
    before = src.stat().st_size
    im = Image.open(src)
    # Logos are PNGs with transparency; RGBA survives into WebP, so only flatten
    # the palette/grayscale modes that WebP cannot take directly.
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    w, h = im.size
    if w > MAX_WIDTH:
        im = im.resize((MAX_WIDTH, round(h * MAX_WIDTH / w)), Image.LANCZOS)
    dst = src.with_suffix(".webp")
    im.save(dst, "WEBP", quality=QUALITY, method=6)
    return dst, before, dst.stat().st_size


def main() -> int:
    apply = "--apply" in sys.argv
    targets: list[Path] = []
    for bank in BANKS:
        for entry in json.loads((DATA / bank).read_text()):
            ref = entry.get("image")
            if not ref:
                continue
            p = PUBLIC / ref.lstrip("/")
            if p.exists():
                targets.append(p)
            else:
                print(f"  MISSING {ref}")

    print(f"{len(targets)} referenced images")
    if not apply:
        print("dry run — pass --apply to write")
        return 0

    before = after = 0
    for i, src in enumerate(targets, 1):
        _, b, a = convert(src)
        before += b
        after += a
        if i % 100 == 0:
            print(f"  {i}/{len(targets)}")

    for bank in BANKS:
        path = DATA / bank
        entries = json.loads(path.read_text())
        for entry in entries:
            ref = entry.get("image")
            if ref and (PUBLIC / ref.lstrip("/")).with_suffix(".webp").exists():
                entry["image"] = str(Path(ref).with_suffix(".webp"))
        path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")
        print(f"  rewrote {bank}")

    # Originals are removed only after every reference points at a .webp, so a failed
    # run leaves the JPEGs in place and the app still works.
    for src in targets:
        if src.with_suffix(".webp").exists():
            src.unlink()

    print(f"{before / 1e6:.1f}MB -> {after / 1e6:.1f}MB ({100 - 100 * after / before:.0f}% saved)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
