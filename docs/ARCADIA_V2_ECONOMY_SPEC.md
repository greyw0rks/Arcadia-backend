# Arcadia V2 — Weekly Pool Economy Spec

**Status:** Draft — scoring mechanic reworked in §4.2 (per-round threshold) after §5.2a simulation showed the per-question design unworkable; awaiting sign-off
**Author:** Greysuit
**Last updated:** 2026-07-29

> **This file is the only source of truth.** Older copies of this spec exist outside the repo (most
> recently a 2026-07-23 draft). They predate the §5.2a simulation and still specify the
> ±0.01x/question mechanic it disproved. Reconciled 2026-07-29 — see §8.

---

## 1. Overview

Arcadia V2 replaces the current win-now/lose-now single-round model with a **weekly pooled buy-in system**. Users stake once per week, earn XP/multiplier through gameplay performance, and are paid out from a shared prize pool at week's end based on final standing. Entry is a single flat $1 — question difficulty scales with a player's current **multiplier**, not with what they paid (§2, §4.1).

Core loop: **Buy in → Answer under difficulty pressure → Earn XP/multiplier → Survive or bust → (rebuy if busted) → Weekly cash payout**

This is structurally closer to a poker/DFS tournament (pooled entries, skill-weighted scoring, rake-based revenue) than to the current instant win/lose format.

---

## 2. Buy-In Structure

| Window | Price | Notes |
|---|---|---|
| Monday early-bird | Discounted (e.g. $0.70) | Fixed time window on Monday only |
| Regular (post-window) | $1.00 flat | Standard weekly entry, available rest of week |
| Rebuy (post-bust) | $1.00 flat | No escalation — same price every rebuy |

- One entry required to begin playing for the week.
- Early-bird window is a segmentation/urgency mechanic — rewards planning ahead, not a permanent discount tier.
- **Difficulty is not bought.** It scales with the player's current multiplier (§4.1), not with entry
  price — every entrant starts on the same 1.0x baseline and the same tier recipe.

> **Resolved — there is no stake tier.** An earlier draft asked whether paying above $1 should buy a
> harder, higher-ceiling lane, and left the buy-in "determines the difficulty band". It does not:
> §6 locks a single $1 flat entry. Two difficulty axes (stake *and* multiplier) cannot be
> calibrated against each other, and a flat entry is also the cleanest skill-game framing — money
> cannot buy a larger share of the pool. The $0.70 early-bird is a timing discount, not a tier.

---

## 3. Daily Gameplay Structure

- After buy-in, a player gets **10 game sections per day**.
  - Each section = **one round of 15 questions**, randomly drawn across Arcadia's game formats.
  - **Each round must include every live game format at least once.** The rule is defined against
    whatever `available: true` in the registry returns at round-build time, *not* a hardcoded count —
    so formats fold in automatically as they ship, with no spec or code change needed.
  - **Currently 9 formats are live**: `trivia`, `truefalse`, `oddoneout`, `geo`, `emoji`, `riddles`,
    `capitals`, `math`, `landmark`. That's 9 slots for coverage plus **6 repeat slots**, filled by
    randomly re-drawing from the live set (no format appearing more than twice, so the mix stays even).
  - `word`, `logo`, `movie`, and `color` are registered but `available: false`. As each goes live the
    repeat-slot count shrinks — at 13 formats it reaches 2, and at 15 coverage exactly fills the round.
    Beyond 15 live formats the coverage guarantee becomes impossible and the rule must degrade to
    "sample 15 distinct formats per round" — worth deciding before that point, not at it.
- **After the 10 free daily sections are used**, the player can keep playing that day by purchasing additional rounds at **$0.10 per round** (a separate, smaller paywall from the weekly buy-in/rebuy below).

### 3.1 Question-bank capacity (a real constraint, not a footnote)

V2 asks for far more questions per player than the current game does. A maximally active player
plays 10 rounds/day × 7 days × 15 questions = **1,050 questions per week**. Split evenly across 9
live formats that's ~117 per format per week. Against the current banks:

| Format | Bank | Weeks until a max-activity player exhausts it |
|---|---|---|
| `trivia` | 1,546 | ~13 |
| `truefalse` | 1,069 | ~9 |
| `riddles` | 612 | ~5 |
| `emoji` | 337 | ~3 |
| `oddoneout` | 330 | ~3 |
| `capitals` | 313 | ~3 |
| `geo` | 312 | ~3 |
| `landmark` | 310 | ~3 |
| `math` | procedural | never |

**The five smallest banks run dry in under a month of heavy play.** The live game never hits this
because a session is only 3–6 rounds; V2 changes the volume by two orders of magnitude.

#### 3.1a The above is optimistic — the real limit is a tier, not a bank

The table divides each bank by total questions. But §4.1 does not draw from a bank, it draws from a
**tier within a bank**, so the binding constraint is a tier cell and it is much smaller. Measured
across the 8 bank-backed formats (2026-07-31, via `node scripts/bank-capacity.mjs` — re-run it after
any bank edit or recipe change rather than trusting these figures):

| Tier | Questions available |
|---|---|
| easy | 443 |
| medium | 1,456 |
| hard | 2,009 |
| extreme | 921 |

Against the §4.1 recipes at 70 rounds/week, holding one band (weeks until that band's scarcest tier
is exhausted):

| Multiplier band | easy | medium | hard | extreme | **Binding** |
|---|---|---|---|---|---|
| 0.01–0.50 (recovery) | 1.6 | 3.0 | 7.2 | — | **easy @ 1.6 wk** |
| 0.51–0.90 | 3.2 | 3.0 | 4.8 | — | medium @ 3.0 wk |
| 0.91–1.20 (baseline) | — | 3.5 | 4.1 | 6.6 | medium @ 3.5 wk |
| 1.21–1.60 | — | 6.9 | 3.6 | 3.3 | extreme @ 3.3 wk |
| 1.61–2.20 | — | 20.8 | 4.1 | 1.9 | extreme @ 1.9 wk |
| 2.21+ (elite) | — | — | 7.2 | 11 slots | **extreme @ 1.2 wk** |

**The worst cell is 1.2 weeks, not 3.** And the two extremes of the curve are the two worst cells,
which is the opposite of harmless:

- **The elite band exhausts fastest (1.2 wk).** That band demands 11 extreme questions per round
  from a pool of 921. A player who is winning is precisely the player parked there, so the highest
  earners in the pool are the first to start seeing repeats — and repeats inflate accuracy, which
  pushes them *further* up. The mechanic that was supposed to pull strong players back toward
  breakeven is the one that decays first.
- **The recovery band is second-worst (1.6 wk) and its tier barely exists.** It asks for 4 easy per
  round against only 443 easy questions total. Worse, **`emoji` and `capitals` contain zero easy
  questions**, so `tiersNearTarget` silently substitutes medium for them — the recovery band is
  already not delivering the accuracy §4.1 models, before any exhaustion.

Sustaining 12 weeks at the worst band would need roughly **8,300 more extreme** and **2,900 more
easy** questions. That is not a content sprint; it is a different content strategy.

#### Consequences

1. **No-repeat can only be guaranteed per-round, not per-week.** The existing picker is seeded
   per-session and no-repeat within it. Extending that guarantee across a whole week is not
   possible at these bank sizes — a player *will* see repeats, and the honest design question is
   how far apart, not whether.
2. **Repeated questions leak difficulty.** A second sighting is effectively easier, which pushes
   accuracy up and multipliers with it — directly working against the progressive-difficulty
   mechanic in §4. Bank exhaustion is therefore an *economic* risk, not just a content one.
3. **It also corrupts the calibration sample.** Per-tier accuracy (§4.1) is measured from live play,
   so once repeats begin the measured accuracy drifts above the true first-sighting accuracy — and
   the numbers meant to *replace* the invented parameters inherit the bias. **The beta's clean
   measurement window is roughly the first 3 weeks**, and shorter for anyone who climbs.
4. **Bank growth is a launch dependency**, not a post-launch nicety.

#### Options, now that the shape is clearer

- **Grow the scarce tiers, not the small banks.** The even-split model said "grow the five smallest
  banks to ~1,000". The tier model says the shortfall is concentrated in `extreme` and `easy`
  specifically. Re-tagging existing questions is cheaper than authoring new ones and should be
  costed first.
- **Flatten the curve's extremes.** The elite band's 11-extreme recipe is what creates the 1.2-week
  cell. A less punishing top band would cost some of the pull-back effect and buy a lot of runway.
- **Weight round composition** toward the large banks and procedural `math`, accepting a less even
  format mix. `math` is the only format that never exhausts, and it is currently one slot in fifteen.
- **Cap effective volume.** The 1,050/week figure assumes a player buys extra rounds daily. If
  purchased rounds are upside-only (§4.2), their volume is a product decision, not a given.

Open question: which combination. Note this interacts with §4.2 — if the pass-mark rework changes
how long players sit in each band, it changes these numbers too, so re-run this analysis against
whichever scoring mechanic is signed off.

---

## 4. Multiplier Mechanic

> **⚠ Read §4.2 first.** The per-question rule below is the ORIGINAL design. Simulation (§5.2a)
> showed it cannot produce a workable economy, and §4.2 proposes the replacement — one ±0.10x move
> per round gated on a pass mark. This section is kept because §4.1's difficulty bands and the
> bust/rebuy rules survive the change intact; only the scoring granularity is superseded.

The multiplier moves at **per-question granularity**, not a flat per-round win/loss:

- Weekly buy-in ($1) grants a baseline multiplier of **1.0x**.
- Each round = 15 questions. **Each correct answer: +0.01x. Each wrong answer: −0.01x.** *(Superseded
  by §4.2 — retained to explain what §5.2a tested and why it failed.)*
- Max possible swing per round is **±0.15x** (15/15 correct = +0.15x; 0/15 correct = −0.15x). Most rounds will land somewhere in between based on actual performance — there's no separate win/loss label anymore; the multiplier change per round **is** the outcome.
- This replaces the earlier flat "±0.1x per round" / "lives" framing — performance within the round now directly determines the multiplier delta, rather than a binary pass/fail per round.
- Multiplier **accumulates through the week and is tallied at the weekend**, when results are finalized and the pool is distributed.
- **Difficulty scales with current multiplier.** As a player's multiplier climbs, question difficulty increases with it — this pulls per-question accuracy back toward ~50% as the player advances, rather than letting a strong run coast on a fixed difficulty. See §5.2 for why this matters (unbounded multiplier growth is a real risk without it).

### Floor / Bust
- **Multiplier reaching zero = bust.** The player's current run ends; multiplier progress for that run is forfeited.
- To resume playing that week, the player must complete the **standard $1 buy-in again** (not the $0.10 extra-round ticket — that's a separate, smaller mechanic for extra daily volume within an active run).
- Forfeited stake behavior on bust: unchanged from §6 below — returns to the weekly pool, not platform revenue.

> **Resolved — and this is what broke the design.** An earlier draft flagged that small per-question
> increments would make bust gradual rather than sudden, and asked bust-rate modelling to account
> for it. §5.2a did, and found the consequence is worse than "gradual": across 1,050 increments the
> noise term is so small relative to drift that bust becomes a *cliff* — ~85% at one skill level and
> ~0.2% one step up — with no setting in between. The bust and rebuy rules above are unchanged under
> §4.2; only what moves the multiplier changes.

### Rebuy behavior (post-bust)
- Price: flat $1, no escalation regardless of how many times a user rebuys in a week.
- Multiplier: **full reset** on rebuy — fresh 1.0x baseline, no carried-over progress from the busted run.
- **Rebuy friction: 15-minute cooldown between rebuys, plus an in-app nudge from the 4th rebuy
  onward** ("you've rebought 3× this week — take a break?"). No hard cap. The cooldown stops
  instant re-entry loops and the nudge gives heavy rebuyers a visible signal, without capping
  volume the way a hard weekly ceiling would. Revisit if beta telemetry shows a small group
  rebuying far beyond the nudge.

### 4.1 The difficulty curve

Difficulty is a **function of current multiplier**, expressed as a 15-slot tier recipe per band.
This is the concrete form of the §4 rule.

| Multiplier band | easy | medium | hard | extreme | Modelled accuracy | Drift/round |
|---|---|---|---|---|---|---|
| 0.01 – 0.50 (near bust) | 4 | 7 | 4 | 0 | ~65% | +0.045x |
| 0.51 – 0.90 | 2 | 7 | 6 | 0 | ~60% | +0.029x |
| 0.91 – 1.20 (baseline) | 0 | 6 | 7 | 2 | ~51% | +0.003x |
| 1.21 – 1.60 | 0 | 3 | 8 | 4 | ~45% | −0.015x |
| 1.61 – 2.20 | 0 | 1 | 7 | 7 | ~39% | −0.032x |
| 2.21+ (elite) | 0 | 0 | 4 | 11 | ~34% | −0.048x |

The shape is what matters: **positive drift below 1.0x, near-zero at baseline, negative above.**
That's a self-correcting equilibrium — a player near bust gets a genuine chance to recover, and a
player running hot faces questions that pull them back toward breakeven instead of compounding
away with the pool.

**The accuracy column is modelled, not measured.** It assumes per-tier accuracy of easy 85% /
medium 65% / hard 45% / extreme 30% against 4-choice questions where a blind guess scores 25%.
Those four numbers are invented. They are the *only* free parameters in the whole curve, and the
private beta exists to measure them.

**The instrumentation to replace them is live** (shipped 2026-07-29). Every scored answer during the
private beta writes a `calibration_samples` row tagged with the tier actually served; read the
aggregate at `GET /api/admin/v2/calibration`, which returns per-tier accuracy, per-format accuracy,
and the per-player skill distribution. It is V2-gated, so only the private-tester deploy collects it,
and demo plays are excluded from the aggregate — a free session has nothing at stake and is not drawn
from the same effort distribution as a paid one. Timeouts are recorded separately from wrong answers,
so a tier that only looks hard because the timer is short can be told apart from one that genuinely
is. Re-derive this table from real values before any mainnet exposure.

> **⚠ Simulating this curve broke it.** See §5.2a: the self-correcting recovery band turns out to
> make bust almost impossible, and the resulting bust rate cliffs rather than curves. The band
> table above is the right *shape* but cannot be used until the underlying scoring mechanic is
> fixed (§7.1).

Two implementation constraints, both verified against the live banks:

- **This curve unlocks the easy/medium banks, reversing a deliberate V1 decision.** The live game's
  `TIER_RECIPES` never serves easy or medium at any stake — the floor exists because at low
  difficulty a competent player could grind a reliable positive expectation and drain the house
  treasury. That reasoning **does not carry over to V2**: payouts come from a player-funded pool
  with a rake, not from house funds, so a strong player wins a larger share of a fixed pool rather
  than extracting from the platform. The ~1,900 easy/medium questions currently unused become the
  recovery band. This is safe *only* because the pool model replaced the treasury model — if any
  V2 mode ever pays from house funds, the floor must come back.
- **Tier availability is uneven, so recipes are per-slot with fallback, never per-format demands.**
  `emoji` and `capitals` have **zero** easy questions and `math` is procedural, so a recipe asking
  for "4 easy" cannot be satisfied format-by-format. The existing `tiersNearTarget` fallback in
  `choiceGame.ts` already expands outward to the nearest available tier; the curve relies on that
  behaviour rather than assuming a full tier matrix. For `math`, difficulty maps onto its existing
  procedural operand tiers instead of a bank lookup.

Timer scaling stays available as a second, independent lever but is **not** used by this curve —
one axis is calibratable, two are not (the same argument that settled the stake-tier question).

### 4.2 PROPOSED — per-round threshold scoring (the fix for §5.2a)

**Replace per-question multiplier movement with one move per round, gated on a pass mark.**

| | Old (broken) | Proposed |
|---|---|---|
| Multiplier events per week | 1,050 (one per question) | **70** (one per round) |
| Step size | ±0.01x | **±0.10x** |
| Rule | every answer moves the multiplier | **≥9 of 15 correct → +0.10x, otherwise −0.10x** |
| Score within a round | determines the delta directly | determines only pass/fail |

#### Why this specifically, and why nothing smaller would do

The failure in §5.2a is governed by one ratio. For an additive walk of `K` events with step `s` and
per-event drift `d`:

```
total drift   = K · d
total noise   = s · √K
dominance     = drift / noise = √K · (d / s)
```

Luck only matters when dominance is near or below 1. Measured against a 2-point accuracy edge:

| Design | K | step | dominance |
|---|---|---|---|
| per-question, 10 rounds/day | 1,050 | 0.01 | **1.30** — accuracy determines everything |
| per-question, 5 rounds/day | 525 | 0.01 | 0.92 — halving volume barely helps (√ scaling) |
| **per-round, 10 rounds/day** | **70** | **0.10** | **0.33** — variance survives |
| per-day outcome | 7 | 0.15 | 0.11 |

This is why the fix has to be *fewer, bigger* events. Cutting the daily allowance was the intuitive
move and it does almost nothing, because noise falls as `√K` while drift falls as `K`. Only changing
the event granularity shifts the ratio meaningfully.

#### The pass mark is the tuning dial that was missing

Population simulation, 15,000 players, skill ~ N(1.0, 0.15):

| Pass mark | Bust rate | p10 | Median | p90 | Spread (p99/p10) |
|---|---|---|---|---|---|
| 7 / 15 | 1.8% | 0.80 | 1.40 | 2.20 | 4.25× |
| 8 / 15 | 8.4% | 0.60 | 1.20 | 1.60 | 3.67× |
| **9 / 15** | **23.8%** | 0.40 | 0.80 | 1.40 | **4.50×** |
| 10 / 15 | 48.2% | 0.40 | 0.80 | 1.20 | 3.50× |
| 11 / 15 | 73.0% | 0.20 | 0.60 | 1.00 | 6.00× |

Compare with §5.2a, where every difficulty setting gave either ~0% or ~85%. **Bust rate is now a
smooth, monotonic function of a single integer**, so a target rate is reachable by choosing it.
Payout spread also rises from 1.56× to ~4.5×, which means a pool split by multiplier actually
discriminates between players.

**Recommended starting point: pass mark 9/15, giving ~24% bust.** Slightly below the 30–35% the
revenue model assumed — deliberately, because it is far better to launch lenient and tighten with
real data than to bust testers out of a beta and lose the accuracy measurements that calibrate
everything else.

Note the population framing is doing real work here: platform bust rate comes mostly from the
*spread of player skill*, not from one player's luck. That is why fixed-skill rows still look
steppy while the population curve is smooth, and it is why measuring the real skill distribution in
the beta matters as much as measuring per-tier accuracy.

#### Purchased rounds must be upside-only

Simulating extra-round purchases under symmetric scoring exposed a serious problem:

| Rounds/day | Weekly spend | Bust (symmetric) | Bust (upside-only) | Median (upside-only) |
|---|---|---|---|---|
| 10 (free) | $0.00 | 23.8% | 23.8% | 0.80 |
| 20 | $7.00 | 28.5% | **12.0%** | 1.20 |
| 30 | $14.00 | 31.9% | **8.1%** | 1.50 |

Under symmetric scoring, **a player spending $14/week to play more raises their own bust
probability by ~8 points.** They pay real money to make ruin more likely, while the platform takes
rake on every ticket. That is a textbook predatory pattern and it must not ship.

**Therefore: rounds purchased beyond the free daily allowance can gain +0.10x but never subtract.**
The buyer's downside is capped at the ticket price, and the purchase becomes honestly positive for
them. This also keeps the pool healthy rather than draining it — a player paying 14× the entry fee
for roughly 1.9× the median multiplier is *subsidising* the pool, since the tickets are raked into
it. Free rounds stay symmetric, so the core game keeps its tension.

#### What this changes elsewhere

- **§4's per-question ±0.01x rule is superseded.** Per-question feedback stays in the UI as live
  progress within a round — it just no longer moves the banked multiplier.
- **Bust still means the multiplier reaching zero**, and the §4.1 difficulty bands are unchanged;
  they now gate the *pass probability* rather than the size of each step.
- **§5.4's revenue model can be re-derived**, because a target bust rate is now selectable.
- The threshold is a single integer in config, so it can be tuned per week without a redeploy —
  and it must be treated as a live economic parameter, not a constant.

**Still assumption-bound.** Every number above rests on the same invented per-tier accuracies
(easy 85% / medium 65% / hard 45% / extreme 30%) and on an assumed skill distribution. The
mechanic's *shape* is validated — a smooth dial exists — but the specific pass mark is not. Measure
both distributions in the private beta, then re-run `scripts/v2-bust-sim.py` before mainnet.

---

## 5. Revenue Model

### 5.1 Revenue mechanism
Platform revenue comes from two sources: **rake** and **private matches**.

1. **Rake** — taken at every pooled entry event: initial buy-ins, rebuys, **and extra-round tickets**. This is the platform's cut; the remainder of all three feeds the weekly payout pool. Extra-round tickets ($0.10/round) are **not** a separate non-pooled fee — they flow into the same pool/rake split as buy-ins and rebuys.
2. **Private matches** — a separate revenue stream (details TBD — not yet specified in this doc; likely user-created/paid matches outside the standard weekly pool structure, similar to private lobbies in other games). Needs its own scoping pass.

```
Gross pooled volume  = (early-bird entries × early price)
                      + (regular entries × $1)
                      + (total rebuys × $1)
                      + (total extra rounds × $0.10)

Rake revenue         = Gross pooled volume × rake %
Weekly pool payout   = Gross pooled volume × (1 − rake %)

Total platform revenue = Rake revenue + Private match revenue (TBD)
```

### 5.2 Bust-pacing model

The multiplier is a random walk with drift, where the drift is set by **p** — the player's per-question accuracy, which reflects question difficulty relative to skill.

**Net change per round = 0.15 × (2p − 1)** (15 questions, ±0.01x each, so a round can swing anywhere from −0.15x to +0.15x depending on score).

| Accuracy (p) | Drift/round | Expected rounds to bust (from 1.0x) | Days (at 10 free rounds/day) |
|---|---|---|---|
| 30% | −0.06x | ~17 | ~1.7 |
| 35% | −0.045x | ~22 | ~2.2 |
| 40% | −0.03x | ~33 | ~3.3 |
| 45% | −0.015x | ~67 | ~6.7 |
| **50%** | **0** | effectively never busts on drift alone | — |
| 55%+ | positive | multiplier grows without bound | — |

**Key finding: p=50% is the breakeven point.** Below it, players drift toward bust at a rate directly set by how much harder the questions are than their skill level. Above it, multiplier grows indefinitely with no natural pullback — this is the problem progressive difficulty (§4) solves: as multiplier climbs, difficulty rises with it, dragging p back toward ~50% so no single strong run can accumulate an unbounded share of the pool.

Numbers above are the deterministic drift approximation only. **§5.2a supersedes them with an actual
simulation, and the simulation contradicts the design.** Read that before acting on this table.

### 5.2a Monte Carlo results — the ±0.01x/question mechanic does not work as specified

Run `scripts/v2-bust-sim.py`. 20,000 simulated players per row, a full week at 10 rounds/day × 15
questions, running the §4.1 curve. "Skill" scales per-tier accuracy (1.0 = the modelled average).

| Skill | Bust rate | Median bust day | p10 final | Median final | p90 final |
|---|---|---|---|---|---|
| 0.70 | 85.3% | 5 | 0.04 | 0.16 | 0.34 |
| 0.80 | 0.2% | 7 | 0.38 | 0.52 | 0.74 |
| 0.90 | 0.0% | — | 0.80 | 0.90 | 1.00 |
| 1.00 | 0.0% | — | 0.96 | 1.12 | 1.24 |
| 1.10 | 0.0% | — | 1.18 | 1.32 | 1.54 |
| 1.20 | 0.0% | — | 1.50 | 1.60 | 1.74 |

**Three failures, all structural rather than tuning problems:**

1. **Bust is a cliff, not a curve.** It goes from 85% to 0.2% between skill 0.70 and 0.80. There is
   no difficulty setting that produces the 30–35% bust rate §5.4's revenue model assumes — the
   mechanic cannot express it. Since rebuys are the only revenue lever and rebuys require busts,
   **the revenue model as written has no mechanical basis.**
2. **Progressive difficulty makes bust nearly impossible by design.** A player at 0.30x plays the
   recovery recipe, which drifts *upward* at +0.045x/round. Busting from there requires roughly a
   7-sigma run of bad luck. The self-correcting curve — the fix for unbounded growth — turned out
   to also be an almost perfect floor. Both halves of it cannot be right at once.
3. **Outcomes barely differentiate, so a pool split hardly discriminates.** At average skill the
   whole p1–p99 range is 0.86x–1.34x, a spread of just 1.56×. The best and worst surviving players
   would be paid almost the same.

**Root cause: 1,050 questions per week is too many for variance to matter.** Over N questions at
±0.01x the noise is only `0.01 × √N` — ±0.32x across a week — while a mere 2-percentage-point
accuracy edge produces 0.42x of drift. Signal beats noise by construction, so the final multiplier
is essentially a deterministic readout of accuracy. Luck is squeezed out, and with it both bust
variance and payout spread.

This is the "many small increments" consequence flagged in §4, now quantified: the older
±0.1x-per-round design had 10× the step size and 1/15th the events, so variance genuinely mattered
there. Two candidate repairs — a neutral rather than generous recovery band, and a per-round decay —
were both simulated and **both still produce the same 0%→100% cliff**, confirming the problem is the
step-size-to-volume ratio rather than the recipe values.

Resolving this is a product decision, not a parameter tweak. **§4.2 proposes the fix** — per-round
threshold scoring, which restores variance and makes bust rate a smooth, tunable dial.

### 5.3 Why the difficulty/floor curve IS the revenue lever
Because forfeited stakes stay in the pool (not platform revenue) and rebuys are flat-priced, **volume is the only thing that moves revenue** — and volume is driven by the bust rate:

- Floor too lenient (p stays near/above 50% too long) → few busts → few rebuys → low volume.
- Floor too harsh (p drops too fast) → players bust and churn instead of rebuying → also low volume.
- Target: a difficulty curve that's beatable-but-tense — accuracy hovering somewhere in the 35–45% band for an "average" player feels achievable, since bust in 2–7 days keeps engagement without feeling unfair.

This means difficulty/floor calibration is a **product decision with direct revenue consequences**, not purely a game-design one. Needs dedicated modeling once question-difficulty tiers are defined (separate from this doc).

> **§5.2a invalidates the premise of this section.** The mechanic cannot hit a target bust rate at
> all — it cliffs from ~85% to ~0%. "Tune the floor until the bust rate is right" is not an
> available move until the scoring mechanic changes. Revenue depending on bust rate is exactly why
> that blocker is critical rather than cosmetic.

### 5.4 Illustrative model (rake = 15%, directional only)

> **Blocked by §5.2a.** Every row assumes a 30–35% bust rate. The simulation says the current
> mechanic produces either ~0% or ~85%, so these figures describe an economy the game does not
> currently implement. Kept for structure, not for sizing.

| Weekly active users | Early-bird mix | Bust rate | Avg rebuys/busted user | Gross volume | Platform revenue | Pool paid out |
|---|---|---|---|---|---|---|
| 1,000 | 20% @ $0.70 | 30% | 1.5 | $1,390 | ~$208 | ~$1,182 |
| 5,000 | 20% @ $0.70 | 30% | 1.5 | $6,950 | ~$1,042 | ~$5,908 |
| 20,000 | 20% @ $0.70 | 35% | 1.8 | $32,720 | ~$4,908 | ~$27,812 |

At 20k weekly actives: ~$19–25k/month in pure rake, before private match revenue. **These numbers are placeholders for structure validation — real bust rate, rebuy behavior, and extra-round purchase rate are all unknown until playtested.** The table above doesn't yet fold in extra-round volume (now part of gross pooled volume per §5.1) — needs engagement data (how many active players exceed 10 sections/day, and how often) before it can be sized.

### 5.5 Secondary revenue (not yet modeled)
- **Private matches**: separate revenue stream, mechanics not yet defined — needs its own spec.
- **Float yield**: pooled stablecoins sit for up to a week before payout — deployable into Aave/Morpho for yield during that window. Marginal until pool size is consistently large; worth having, not worth relying on early.
- **Sponsor-funded pool top-ups**: sponsors add to the weekly pool in exchange for branded question packs / placement in harder tiers. Subsidizes payouts without raising rake.
- **Free/XP-only tier**: no buy-in, no cash payout, funnels volume into paid tiers; can carry light sponsor placement.

---

## 6. Design Decisions Locked So Far

| Decision | Choice |
|---|---|
| Forfeited stake destination | Returns to weekly pool (not platform revenue) |
| Entry price | **Single $1 flat entry — no stake tiers.** One difficulty axis (multiplier), the only version that's calibratable; also the cleanest skill-game framing. $0.70 early-bird is a timing discount, not a tier |
| Rebuy pricing | Flat $1, no escalation |
| Multiplier on rebuy | Full reset (fresh 1.0x baseline) |
| Rebuy friction | **15-min cooldown between rebuys + in-app nudge from the 4th rebuy onward.** No hard cap |
| Rake collection point | At every entry event (initial + rebuys + extra rounds) |
| Daily section allowance | 10 free sections/day (15 questions each) |
| Extra-round pricing | $0.10/round after daily allowance used — feeds pool, same as buy-ins |
| Format coverage | Every **live** format at least once per round, defined against the registry's `available` flag — currently 9, so 9 coverage slots + 6 repeats |
| Scoring granularity | **⚠ NOT LOCKED — the one open item in this table.** The original ±0.01x/question rule (max ±0.15x per round) was disproven by §5.2a. §4.2 proposes ±0.10x once per round, gated on ≥9/15 correct, with purchased rounds upside-only. Awaiting sign-off (§7.1) |
| Bust condition | Cumulative multiplier reaches zero |
| Difficulty scaling | Increases with current multiplier per the §4.1 band table, not fixed at buy-in. Unlocks the easy/medium banks V1 never served — safe only because payouts come from a player pool, not house funds |
| Payout timing | Weekend tally, once per week |
| Platform revenue sources | Rake (on all pooled entries) + private matches |

## 7. Open Questions

1. **⚠ AWAITING SIGN-OFF — the scoring mechanic fix (§4.2).** The ±0.01x/question design is broken
   (§5.2a). §4.2 proposes per-round threshold scoring: one ±0.10x move per round, gated on ≥9/15
   correct, with purchased rounds upside-only. Simulation shows bust rate becomes a smooth dial
   (1.8% → 73% across pass marks 7–11) and payout spread rises from 1.56× to ~4.5×. Needs a
   decision before `ArcadiaPool.sol` or the weekly engine can be built.
2. **Question-bank capacity (§3.1).** Worse than the original even-split estimate: the binding
   constraint is a *tier* cell, not a bank, and the worst is `extreme` in the elite band at **1.2
   weeks** (§3.1a). The two ends of the difficulty curve are the two scarcest cells, and two formats
   have no easy questions at all. Options are re-tagging toward the scarce tiers, flattening the
   curve's extremes, weighting toward the large banks and `math`, or capping purchased volume —
   likely some combination.
3. **Measure the per-tier accuracy assumptions.** The §4.1 curve rests on easy 85% / medium 65% /
   hard 45% / extreme 30%, all invented. These are the only free parameters in the model.
   **Instrumentation shipped 2026-07-29** — `calibration_samples` plus
   `GET /api/admin/v2/calibration` (§4.1). What remains is not code: testers have to play, and then
   the curve gets re-derived. Note the sample is only clean while banks hold out — see §3.1a: the
   scarcest tier cell lasts ~1.2 weeks and repeat sightings inflate measured accuracy, so the clean
   measurement window is roughly the first 3 weeks and shorter for anyone who climbs.
4. Private match mechanics — entirely undefined. Needs its own spec (buy-in structure, pooled or
   peer-to-peer, does it reuse the difficulty/format system).
5. Regulatory framing — pooled buy-in + skill-weighted scoring + delayed cash payout needs a
   deliberate "skill game" framing (ToS, marketing language) given cash payouts and Nigeria-based
   operations. Flag for a separate legal/compliance pass.
6. Coverage rule beyond 15 live formats — the per-round guarantee becomes impossible; decide the
   degradation before reaching it.

---

## 8. Next Steps

- [ ] **Sign off the §4.2 scoring rework — blocks the pool contract and the weekly engine**
- [ ] Decide extra-round scoring is upside-only (§4.2) — required before extra-round tickets ship
- [ ] Decide bank growth vs. format weighting (§7.2) — re-scope against §3.1a: the shortfall is in
      `extreme` and `easy` specifically, not in the small banks generally
- [x] ~~Instrument per-tier accuracy in the private beta (§7.3)~~ — shipped 2026-07-29; now waiting
      on tester play, not code
- [ ] Distribute tester codes — the sampler collects nothing until someone plays
- [ ] Re-run `scripts/v2-bust-sim.py` against the revised mechanic and measured accuracy
- [ ] Re-derive the §5.4 revenue model once a real bust rate exists
- [ ] Scope private match mechanics as a standalone spec (§7.4)
- [ ] Draft skill-game framing language for ToS/marketing (§7.5)

**Resolved this pass:** stake-tier vs. progressive-difficulty overlap (single $1 entry) · rebuy
friction (cooldown + nudge) · concrete difficulty curve (§4.1) · variance simulation (§5.2a, which
surfaced the blocker) · format coverage against the 9 live games (§3) · bank-capacity analysis (§3.1)
· per-tier accuracy instrumentation (§4.1, §7.3)

**Superseded drafts.** A 2026-07-23 copy of this spec circulated separately (169 lines, "revenue
model directional, difficulty/bust-rate calibration pending"). Everything in it is contained here;
four of its six open questions are resolved above, and its §6 locks the ±0.01x/question rule that
§5.2a later disproved. Reconciled 2026-07-29 — treat this file as the only source of truth, and
discard older copies rather than merging from them.
