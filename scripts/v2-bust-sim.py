#!/usr/bin/env python3
"""Monte Carlo for the V2 weekly multiplier walk.

Two mechanics are modelled so they can be compared directly:

  "per-question"  — the original spec: each answer moves the multiplier ±0.01x.
                    Broken. See spec §5.2a: 1050 questions/week makes noise
                    (0.01·√N ≈ 0.32x) far smaller than the drift a small
                    accuracy edge produces, so outcomes are a deterministic
                    readout of accuracy. Bust rate cliffs 0%→85%.

  "threshold"     — the proposed fix (spec §4.2): one ±0.10x move per ROUND,
                    gated on a pass mark out of 15. 70 events of 0.10x instead
                    of 1050 of 0.01x, which restores variance.

Population runs matter more than fixed-skill runs: platform bust rate is
driven by the spread of player skill, not by one player's luck.

P_TIER values are ASSUMPTIONS pending measurement in the private beta. They
are the only free parameters in the model — measure them first, then re-run.

Usage:
    python3 scripts/v2-bust-sim.py
"""
import random

# Per-tier probability that an average player answers correctly.
# 4-choice questions, so a blind guess scores 0.25.
P_TIER = {"easy": 0.85, "medium": 0.65, "hard": 0.45, "extreme": 0.30}

# (lo, hi, 15-slot tier recipe) — difficulty rises with current multiplier. Spec §4.1.
BANDS = [
    (0.00, 0.50, {"easy": 4, "medium": 7, "hard": 4, "extreme": 0}),
    (0.50, 0.90, {"easy": 2, "medium": 7, "hard": 6, "extreme": 0}),
    (0.90, 1.20, {"easy": 0, "medium": 6, "hard": 7, "extreme": 2}),
    (1.20, 1.60, {"easy": 0, "medium": 3, "hard": 8, "extreme": 4}),
    (1.60, 2.20, {"easy": 0, "medium": 1, "hard": 7, "extreme": 7}),
    (2.20, 99.0, {"easy": 0, "medium": 0, "hard": 4, "extreme": 11}),
]

QUESTIONS_PER_ROUND = 15
FREE_ROUNDS_PER_DAY = 10
DAYS = 7
PASS_MARK = 9          # correct answers needed for a round to gain, spec §4.2
ROUND_STEP = 0.10      # multiplier move per round
QUESTION_STEP = 0.01   # multiplier move per question (legacy mechanic)


def recipe_for(multiplier):
    for lo, hi, recipe in BANDS:
        if lo <= multiplier < hi:
            return recipe
    return BANDS[-1][2]


def answer_round(multiplier, skill, consumed=None):
    """Play 15 questions. Returns the number answered correctly.

    `consumed` optionally accumulates how many questions of each tier were served,
    which is what couples the pass mark to bank exhaustion (spec §3.1a).
    """
    correct = 0
    for tier, count in recipe_for(multiplier).items():
        if consumed is not None:
            consumed[tier] += count
        p = min(0.97, max(0.03, P_TIER[tier] * skill))
        for _ in range(count):
            if random.random() < p:
                correct += 1
    return correct


def play_week(skill, mechanic="threshold", rounds_per_day=FREE_ROUNDS_PER_DAY,
              upside_only_extras=True, pass_mark=PASS_MARK, consumed=None):
    """Returns the final multiplier, or 0.0 if the player busted."""
    multiplier = 1.0
    for _ in range(DAYS):
        for round_index in range(rounds_per_day):
            correct = answer_round(multiplier, skill, consumed)

            if mechanic == "per-question":
                multiplier += QUESTION_STEP * (2 * correct - QUESTIONS_PER_ROUND)
            else:
                purchased = round_index >= FREE_ROUNDS_PER_DAY
                if correct >= pass_mark:
                    multiplier += ROUND_STEP
                elif not (purchased and upside_only_extras):
                    # Purchased rounds can only gain — buying volume must never
                    # raise the buyer's own bust risk. Spec §4.2.
                    multiplier -= ROUND_STEP

            if multiplier <= 0:
                return 0.0
    return multiplier


def summarise(finals):
    survivors = sorted(f for f in finals if f > 0)
    pct = lambda q: survivors[int(len(survivors) * q)] if survivors else 0.0
    return {
        "bust_rate": sum(1 for f in finals if f <= 0) / len(finals),
        "p10": pct(0.10),
        "median": pct(0.50),
        "p90": pct(0.90),
        "spread": pct(0.99) / max(pct(0.10), 0.01),
    }


def fixed_skill(skill, trials=6000, seed=42, **kwargs):
    random.seed(seed)
    return summarise([play_week(skill, **kwargs) for _ in range(trials)])


def population(trials=15000, seed=11, skill_sd=0.15, consumed=None, **kwargs):
    """Skill ~ N(1.0, sd), truncated. This drives platform-level bust rate."""
    random.seed(seed)
    finals = []
    for _ in range(trials):
        skill = max(0.55, min(1.45, random.gauss(1.0, skill_sd)))
        finals.append(play_week(skill, consumed=consumed, **kwargs))
    return summarise(finals)


# Live bank sizes per tier, across the 8 bank-backed formats (math is procedural).
# Keep in sync with `node scripts/bank-capacity.mjs`, which derives these from data/.
BANK_POOL = {"easy": 443, "medium": 1456, "hard": 2009, "extreme": 921}


def bank_runway(trials=4000, seed=11, **kwargs):
    """Weeks until the scarcest tier runs dry, for one surviving player's play pattern.

    The coupling the pass mark creates: a lenient mark keeps players climbing into the
    high bands, which are extreme-heavy, so extreme burns fast. A harsh mark keeps
    resetting them to 1.0x, which spreads consumption across medium and hard. Bank
    runway is therefore a *consequence* of the scoring decision, not independent of it.
    """
    consumed = {"easy": 0, "medium": 0, "hard": 0, "extreme": 0}
    population(trials=trials, seed=seed, consumed=consumed, **kwargs)
    per_player_week = {t: n / trials for t, n in consumed.items()}
    weeks = {t: (BANK_POOL[t] / v if v else float("inf"))
             for t, v in per_player_week.items()}
    scarcest = min(weeks, key=weeks.get)
    return per_player_week, weeks, scarcest, weeks[scarcest]


def table(title, rows):
    print(f"\n{title}")
    print(f"{'':>14} {'bust':>7} {'p10':>7} {'median':>7} {'p90':>7} {'spread':>7}")
    for label, r in rows:
        print(f"{label:>14} {r['bust_rate']:6.1%} {r['p10']:7.2f} "
              f"{r['median']:7.2f} {r['p90']:7.2f} {r['spread']:6.2f}x")


if __name__ == "__main__":
    print(f"{DAYS} days x {FREE_ROUNDS_PER_DAY} rounds x {QUESTIONS_PER_ROUND} questions "
          f"= {DAYS * FREE_ROUNDS_PER_DAY * QUESTIONS_PER_ROUND} questions/week")

    table("BROKEN — per-question ±0.01x, by fixed skill (bust cliffs, no spread)",
          [(f"skill {s:.2f}", fixed_skill(s, mechanic="per-question"))
           for s in (0.70, 0.80, 0.90, 1.00, 1.10)])

    table("FIXED — per-round ±0.10x, by fixed skill",
          [(f"skill {s:.2f}", fixed_skill(s, mechanic="threshold"))
           for s in (0.70, 0.80, 0.90, 1.00, 1.10)])

    table("PASS MARK is the tuning dial (population, skill sd 0.15)",
          [(f"pass {m}/15", population(pass_mark=m)) for m in (7, 8, 9, 10, 11)])

    table("PURCHASED ROUNDS must be upside-only or buying volume raises bust risk",
          [(f"{r}/day sym", population(rounds_per_day=r, upside_only_extras=False))
           for r in (10, 20, 30)] +
          [(f"{r}/day upside", population(rounds_per_day=r, upside_only_extras=True))
           for r in (20, 30)])

    # ── Pass mark vs. bank runway ─────────────────────────────────────────────
    # The two open decisions (§7.1 scoring, §7.2 banks) are coupled: the pass mark
    # sets how long players occupy each multiplier band, and each band has its own
    # tier recipe. Deciding banks before scoring risks sizing content against a
    # difficulty curve that then changes shape.
    print("\nPASS MARK vs. BANK RUNWAY — questions consumed per player-week, and")
    print("weeks until the scarcest tier is exhausted (pool: "
          + ", ".join(f"{t} {n}" for t, n in BANK_POOL.items()) + ")")
    print(f"{'':>14} {'easy':>7} {'medium':>7} {'hard':>7} {'extreme':>8}   scarcest")
    for mark in (7, 8, 9, 10, 11):
        per, weeks, tier, wk = bank_runway(pass_mark=mark)
        cells = " ".join(f"{per[t]:7.0f}" for t in ("easy", "medium", "hard"))
        print(f"    pass {mark}/15 {cells} {per['extreme']:8.0f}   "
              f"{tier} @ {wk:.1f} wk")

    print("\n  Read with the bust-rate table above: a harsher pass mark buys bank")
    print("  runway because busted players reset to 1.0x instead of climbing into")
    print("  the extreme-heavy bands. The two decisions trade against each other.")
