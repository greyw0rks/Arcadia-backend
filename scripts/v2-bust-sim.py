#!/usr/bin/env python3
"""Monte Carlo for the V2 weekly multiplier walk (spec §5.2a).

Answers: given the §4.1 difficulty curve, what bust rate and final-multiplier
spread does a week of play actually produce? The deterministic drift table in
§5.2 ignores variance; this does not.

Result: the mechanic cannot produce a middling bust rate. It cliffs from ~85%
to ~0% across a narrow skill band, because 1050 questions/week at ±0.01x leaves
variance (±0.32x) far smaller than the drift a small accuracy edge creates.

P_TIER values are ASSUMPTIONS pending measurement in the private beta.
"""
import random

P_TIER = {"easy": 0.85, "medium": 0.65, "hard": 0.45, "extreme": 0.30}

# (lo, hi, 15-slot tier recipe) — spec §4.1
BANDS = [
    (0.00, 0.50, {"easy": 4, "medium": 7, "hard": 4, "extreme": 0}),
    (0.50, 0.90, {"easy": 2, "medium": 7, "hard": 6, "extreme": 0}),
    (0.90, 1.20, {"easy": 0, "medium": 6, "hard": 7, "extreme": 2}),
    (1.20, 1.60, {"easy": 0, "medium": 3, "hard": 8, "extreme": 4}),
    (1.60, 2.20, {"easy": 0, "medium": 1, "hard": 7, "extreme": 7}),
    (2.20, 99.0, {"easy": 0, "medium": 0, "hard": 4, "extreme": 11}),
]

STEP = 0.01
ROUNDS_PER_DAY = 10
DAYS = 7


def recipe_for(m):
    for lo, hi, r in BANDS:
        if lo <= m < hi:
            return r
    return BANDS[-1][2]


def play_round(m, skill):
    for tier, n in recipe_for(m).items():
        for _ in range(n):
            p = min(0.97, max(0.03, P_TIER[tier] * skill))
            m += STEP if random.random() < p else -STEP
            if m <= 0:
                return 0.0
    return m


def simulate(skill, trials=20000, seed=42):
    random.seed(seed)
    finals, bust_days = [], []
    for _ in range(trials):
        m, busted = 1.0, False
        for day in range(DAYS):
            for _ in range(ROUNDS_PER_DAY):
                m = play_round(m, skill)
                if m <= 0:
                    busted = True
                    break
            if busted:
                bust_days.append(day + 1)
                break
        finals.append(0.0 if busted else m)

    survivors = sorted(f for f in finals if f > 0)
    pct = lambda q: survivors[int(len(survivors) * q)] if survivors else 0.0
    return {
        "bust_rate": sum(1 for f in finals if f <= 0) / trials,
        "median_bust_day": sorted(bust_days)[len(bust_days) // 2] if bust_days else None,
        "p10": pct(0.10),
        "median": pct(0.50),
        "p90": pct(0.90),
    }


if __name__ == "__main__":
    print(f"{DAYS} days x {ROUNDS_PER_DAY} rounds x 15 questions = "
          f"{DAYS * ROUNDS_PER_DAY * 15} questions/week\n")
    print(f"{'skill':>6} {'bust':>7} {'bust day':>9} {'p10':>7} {'median':>8} {'p90':>7}")
    for skill in (0.70, 0.80, 0.90, 1.00, 1.10, 1.20):
        r = simulate(skill)
        day = r["median_bust_day"] or "-"
        print(f"{skill:6.2f} {r['bust_rate']:6.1%} {str(day):>9} "
              f"{r['p10']:7.2f} {r['median']:8.2f} {r['p90']:7.2f}")
