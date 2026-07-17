#!/usr/bin/env python3
# Validates and merges workflow-generated question slices into the data banks.
# Reads scripts/qgen/<bank>-<n>.json files (each a JSON array of question objects), dedups against
# existing entries and within the new set, enforces per-bank schema, then appends up to 100/bank.
import json, sys, os, glob

HERE = os.path.dirname(os.path.abspath(__file__))
QGEN = os.path.join(HERE, "qgen")
os.chdir(os.path.join(HERE, "..", "data"))

def load(f): return json.load(open(f, encoding="utf-8"))
def save(f, d): json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

def read_slices(bank):
    out = []
    for path in sorted(glob.glob(os.path.join(QGEN, f"{bank}-*.json"))):
        try:
            arr = json.load(open(path, encoding="utf-8"))
            if isinstance(arr, list):
                out.extend(arr)
            else:
                print(f"  WARN {os.path.basename(path)} is not a JSON array, skipped")
        except Exception as e:
            print(f"  WARN failed to parse {os.path.basename(path)}: {e}")
    return out

# key extractors for dedup + validators per bank
def valid_options4(q, correct_first=True):
    o = q.get("options")
    return isinstance(o, list) and len(o) == 4 and len(set(o)) == 4

def valid_decoys3(q):
    d = q.get("decoys")
    return isinstance(d, list) and len(d) == 3 and q.get("correct", q.get("capital", q.get("hex"))) not in d and len(set(d)) == 3

BANKS = {
  "trivia": dict(file="trivia.json", key=lambda x: x["q"].strip().lower(),
                 valid=lambda q: bool(q.get("q")) and valid_options4(q) and q.get("answer") == 0 and q.get("tier") in ("hard","extreme")),
  "truefalse": dict(file="truefalse.json", key=lambda x: x["s"].strip().lower(),
                 valid=lambda q: bool(q.get("s")) and isinstance(q.get("a"), bool) and q.get("tier") in ("hard","extreme")),
  "riddles": dict(file="riddles.json", key=lambda x: x["riddle"].strip().lower(),
                 valid=lambda q: bool(q.get("riddle")) and bool(q.get("correct")) and valid_decoys3(q) and q.get("tier") in ("hard","extreme")),
  "capitals": dict(file="capitals.json", key=lambda x: x["country"].strip().lower(),
                 valid=lambda q: bool(q.get("country")) and bool(q.get("capital")) and bool(q.get("flag")) and valid_decoys3(q) and q.get("tier") in ("hard","extreme")),
  "oddoneout": dict(file="oddoneout.json", key=lambda x: tuple(sorted(i.lower() for i in x["items"])),
                 valid=lambda q: isinstance(q.get("items"), list) and len(q["items"]) == 4 and len(set(q["items"])) == 4 and isinstance(q.get("odd"), int) and 0 <= q["odd"] <= 3 and bool(q.get("reason")) and q.get("tier") in ("hard","extreme")),
  "emoji": dict(file="emoji.json", key=lambda x: x["correct"].strip().lower(),
                 valid=lambda q: bool(q.get("emoji")) and bool(q.get("correct")) and valid_decoys3(q) and q.get("tier") in ("hard","extreme")),
  "words": dict(file="words.json", key=lambda x: x["correct"].strip().upper(),
                 valid=lambda q: bool(q.get("correct")) and q.get("prompt","").startswith("Unscramble: ") and q["prompt"].replace("Unscramble: ","").upper() != q["correct"].upper() and valid_decoys3(q) and q.get("tier") in ("hard","extreme")),
  "colors": dict(file="colors.json", key=lambda x: x["name"].strip().lower(),
                 valid=lambda q: bool(q.get("name")) and isinstance(q.get("hex"),str) and q["hex"].startswith("#") and valid_decoys3(q) and q.get("tier") in ("hard","extreme")),
}

TARGET = 100
report = {}
for bank, cfg in BANKS.items():
    new = read_slices(bank)
    d = load(cfg["file"])
    seen = set()
    for x in d:
        try: seen.add(cfg["key"](x))
        except Exception: pass
    accepted, rej_dup, rej_invalid = [], 0, 0
    for q in new:
        if not cfg["valid"](q):
            rej_invalid += 1; continue
        try: k = cfg["key"](q)
        except Exception: rej_invalid += 1; continue
        if k in seen:
            rej_dup += 1; continue
        seen.add(k); accepted.append(q)
    take = accepted[:TARGET]
    d.extend(take)
    save(cfg["file"], d)
    report[bank] = dict(new=len(new), accepted=len(take), dup=rej_dup, invalid=rej_invalid, total=len(d), short=max(0, TARGET-len(take)))

print(json.dumps(report, indent=2))
shortfalls = {b: r["short"] for b, r in report.items() if r["short"] > 0}
if shortfalls:
    print("SHORTFALLS (need more):", json.dumps(shortfalls))
