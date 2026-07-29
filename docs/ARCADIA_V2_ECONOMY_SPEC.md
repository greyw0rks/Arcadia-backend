# Arcadia V2 — Weekly Pool Economy Spec

**Status:** Draft — ⚠ BLOCKED on §7.1: simulation shows the per-question scoring mechanic cannot produce a workable bust rate or payout spread
**Author:** Greysuit
**Last updated:** 2026-07-29

---

## 1. Overview

Arcadia V2 replaces the current win-now/lose-now single-round model with a **weekly pooled buy-in system**. Users stake once per week, earn XP/multiplier through gameplay performance, and are paid out from a shared prize pool at week's end based on final standing. Buy-in amount also scales question difficulty — higher stakes face harder questions.

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
- Buy-in amount (stake tier) determines question difficulty band — higher stakes = harder questions.

**Open question:** does the *stake tier* (i.e., paying more than $1 for a harder/higher-multiplier lane) still exist as a separate axis from the early-bird/regular split, or is $1 the only entry price and difficulty scales purely with performance/multiplier growth within that single tier? This needs to be resolved before difficulty-curve calibration — flagging here rather than assuming.

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
because a session is only 3–6 rounds; V2 changes the volume by two orders of magnitude. Three
consequences:

1. **No-repeat can only be guaranteed per-round, not per-week.** The existing picker is seeded
   per-session and no-repeat within it. Extending that guarantee across a whole week is not
   possible at these bank sizes — a player *will* see repeats, and the honest design question is
   how far apart, not whether.
2. **Repeated questions leak difficulty.** A second sighting is effectively easier, which pushes
   accuracy up and multipliers with it — directly working against the progressive-difficulty
   mechanic in §4. Bank exhaustion is therefore an *economic* risk, not just a content one.
3. **Bank growth is a launch dependency**, not a post-launch nicety. Either the small banks grow
   (target: ≥1,000 each, matching `trivia`), or per-format weighting shifts volume toward the large
   banks and `math`, at the cost of the even-coverage feel.

Open question: which of those two. Weighting is cheap and immediate; authoring ~3,000 questions is
neither, but preserves the design.

---

## 4. Multiplier Mechanic

The multiplier moves at **per-question granularity**, not a flat per-round win/loss:

- Weekly buy-in ($1) grants a baseline multiplier of **1.0x**.
- Each round = 15 questions. **Each correct answer: +0.01x. Each wrong answer: −0.01x.**
- Max possible swing per round is **±0.15x** (15/15 correct = +0.15x; 0/15 correct = −0.15x). Most rounds will land somewhere in between based on actual performance — there's no separate win/loss label anymore; the multiplier change per round **is** the outcome.
- This replaces the earlier flat "±0.1x per round" / "lives" framing — performance within the round now directly determines the multiplier delta, rather than a binary pass/fail per round.
- Multiplier **accumulates through the week and is tallied at the weekend**, when results are finalized and the pool is distributed.
- **Difficulty scales with current multiplier.** As a player's multiplier climbs, question difficulty increases with it — this pulls per-question accuracy back toward ~50% as the player advances, rather than letting a strong run coast on a fixed difficulty. See §5.2 for why this matters (unbounded multiplier growth is a real risk without it).

### Floor / Bust
- **Multiplier reaching zero = bust.** The player's current run ends; multiplier progress for that run is forfeited.
- To resume playing that week, the player must complete the **standard $1 buy-in again** (not the $0.10 extra-round ticket — that's a separate, smaller mechanic for extra daily volume within an active run).
- Forfeited stake behavior on bust: unchanged from §6 below — returns to the weekly pool, not platform revenue.
- **Open question:** since the multiplier now moves in small per-question increments rather than whole 0.1x "lives," bust will typically happen gradually across many rounds rather than in a small number of bad rounds. Bust-rate modeling (§5.2) needs to account for this — it changes the shape of the difficulty curve significantly from the earlier flat-lives version.

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
private beta exists to measure them — instrument per-tier accuracy from the first day of testing
and re-derive this table from real values before any mainnet exposure.

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

Resolving this is a product decision, not a parameter tweak. See §7.1 for the candidate directions.
**Everything downstream — §5.4's revenue table, the bust-driven rebuy loop, and `ArcadiaPool.sol`'s
settlement shape — is blocked on it.**

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
| Per-question scoring | Correct = +0.01x, Wrong = −0.01x (max ±0.15x per 15-question round) — **⚠ see §5.2a, this does not produce a workable economy** |
| Bust condition | Cumulative multiplier reaches zero |
| Difficulty scaling | Increases with current multiplier per the §4.1 band table, not fixed at buy-in. Unlocks the easy/medium banks V1 never served — safe only because payouts come from a player pool, not house funds |
| Payout timing | Weekend tally, once per week |
| Platform revenue sources | Rake (on all pooled entries) + private matches |

## 7. Open Questions

1. **⚠ BLOCKING — how to fix the scoring mechanic (§5.2a).** ±0.01x over 1,050 questions/week
   leaves variance too small to matter, so bust rate cliffs 0%→85% with nothing usable in between
   and final multipliers barely differentiate between players. Candidate directions:
   - count only the **best N rounds per day** toward the multiplier (cuts effective volume, so
     variance survives, and rewards peak play over grinding);
   - **raise the step size** (fewer, bigger moves — back toward the ±0.1x design that had real
     variance, but keeps per-question granularity);
   - make scoring **non-linear** — streak bonuses, tier-weighted deltas — so outcomes fan out;
   - **decouple pool ranking from the multiplier**: rank on a separate score with genuine spread and
     let the multiplier be a progress/prestige display.
   §5.4's revenue model, the rebuy loop, and `ArcadiaPool.sol`'s settlement shape all depend on this.
2. **Question-bank capacity (§3.1).** Five of the nine live banks are exhausted by a heavy player in
   under a month. Either grow them toward ~1,000 each, or weight round composition toward the large
   banks and procedural `math`, accepting a less even format mix.
3. **Measure the per-tier accuracy assumptions.** The §4.1 curve rests on easy 85% / medium 65% /
   hard 45% / extreme 30%, all invented. These are the only free parameters in the model —
   instrument them from day one of the private beta and re-derive the curve.
4. Private match mechanics — entirely undefined. Needs its own spec (buy-in structure, pooled or
   peer-to-peer, does it reuse the difficulty/format system).
5. Regulatory framing — pooled buy-in + skill-weighted scoring + delayed cash payout needs a
   deliberate "skill game" framing (ToS, marketing language) given cash payouts and Nigeria-based
   operations. Flag for a separate legal/compliance pass.
6. Coverage rule beyond 15 live formats — the per-round guarantee becomes impossible; decide the
   degradation before reaching it.

---

## 8. Next Steps

- [ ] **Fix the scoring mechanic (§7.1) — blocks everything else**
- [ ] Decide bank growth vs. format weighting (§7.2)
- [ ] Instrument per-tier accuracy in the private beta (§7.3)
- [ ] Re-run `scripts/v2-bust-sim.py` against the revised mechanic and measured accuracy
- [ ] Re-derive the §5.4 revenue model once a real bust rate exists
- [ ] Scope private match mechanics as a standalone spec (§7.4)
- [ ] Draft skill-game framing language for ToS/marketing (§7.5)

**Resolved this pass:** stake-tier vs. progressive-difficulty overlap (single $1 entry) · rebuy
friction (cooldown + nudge) · concrete difficulty curve (§4.1) · variance simulation (§5.2a, which
surfaced the blocker) · format coverage against the 9 live games (§3) · bank-capacity analysis (§3.1)
