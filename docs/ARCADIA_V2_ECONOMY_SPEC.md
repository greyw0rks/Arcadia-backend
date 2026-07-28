# Arcadia V2 — Weekly Pool Economy Spec

**Status:** Draft — revenue model directional, difficulty/bust-rate calibration pending
**Author:** Greysuit
**Last updated:** 2026-07-23

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
  - **Each round must include all game formats at least once** — with 12 formats and 15 questions per round, that's all 12 formats represented once, plus 3 additional questions from randomly repeated formats. This is a per-round coverage rule, not a per-day one.
- **After the 10 free daily sections are used**, the player can keep playing that day by purchasing additional rounds at **$0.10 per round** (a separate, smaller paywall from the weekly buy-in/rebuy below).

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
- Rebuy cap: **open question** — uncapped rebuys maximize volume/revenue but need at least a soft friction point (cooldown timer, in-app nudge after N rebuys) to avoid predatory-pattern optics. Needs a decision before launch.

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

Numbers above are the deterministic drift approximation only — actual outcomes will spread around these due to per-round variance (a player near breakeven can still bust early on bad luck, or run well above expectation). Full variance modeling (gambler's-ruin-style) is a follow-up once real difficulty tiers exist; the table is directional for setting difficulty targets, not a final simulation.

### 5.3 Why the difficulty/floor curve IS the revenue lever
Because forfeited stakes stay in the pool (not platform revenue) and rebuys are flat-priced, **volume is the only thing that moves revenue** — and volume is driven by the bust rate:

- Floor too lenient (p stays near/above 50% too long) → few busts → few rebuys → low volume.
- Floor too harsh (p drops too fast) → players bust and churn instead of rebuying → also low volume.
- Target: a difficulty curve that's beatable-but-tense — accuracy hovering somewhere in the 35–45% band for an "average" player feels achievable, since bust in 2–7 days keeps engagement without feeling unfair.

This means difficulty/floor calibration is a **product decision with direct revenue consequences**, not purely a game-design one. Needs dedicated modeling once question-difficulty tiers are defined (separate from this doc).

### 5.4 Illustrative model (rake = 15%, directional only)

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
| Rebuy pricing | Flat $1, no escalation |
| Multiplier on rebuy | Full reset (fresh 1.0x baseline) |
| Rake collection point | At every entry event (initial + rebuys + extra rounds) |
| Daily section allowance | 10 free sections/day (15 questions each) |
| Extra-round pricing | $0.10/round after daily allowance used — feeds pool, same as buy-ins |
| Per-question scoring | Correct = +0.01x, Wrong = −0.01x (max ±0.15x per 15-question round) |
| Bust condition | Cumulative multiplier reaches zero |
| Difficulty scaling | Increases with current multiplier, not fixed at buy-in (self-corrects toward ~50% accuracy — see §5.2) |
| Payout timing | Weekend tally, once per week |
| Platform revenue sources | Rake (on all pooled entries) + private matches |

## 7. Open Questions

1. Does a separate "stake tier" axis exist above the $1 flat rate (i.e., can users buy in higher than $1 for harder difficulty / bigger multiplier ceiling), or is difficulty purely performance-driven within a single $1 entry now that difficulty already scales with current multiplier (§4)? These two mechanics may overlap or conflict — needs a decision.
2. Private match mechanics — entirely undefined. Needs its own spec (buy-in structure, is it pooled or peer-to-peer, does it use the same difficulty/format system, etc.).
3. Actual difficulty curve (how much harder questions get per 0.1x of multiplier gained) — §5.2 gives the target accuracy band (35–45%) but not the concrete difficulty-tier definitions needed to hit it.
4. Variance/gambler's-ruin modeling around the §5.2 drift table — current numbers are deterministic-expectation only, not a full simulation.
5. Rebuy cap or soft friction (cooldown, nudge) — none currently specified.
6. Regulatory framing — pooled buy-in + skill-weighted scoring + delayed cash payout needs a deliberate "skill game" framing (ToS, marketing language) given cash payouts and Nigeria-based operations. Not addressed in this spec; flag for separate legal/compliance pass.

---

## 8. Next Steps

- [ ] Resolve stake-tier vs. progressive-difficulty overlap (§7.1)
- [ ] Scope private match mechanics as a standalone spec (§7.2)
- [ ] Define concrete difficulty tiers/curve to hit the 35–45% target accuracy band (§7.3)
- [ ] Run variance/gambler's-ruin simulation once difficulty tiers exist (§7.4)
- [ ] Decide rebuy cap/friction policy
- [ ] Draft skill-game framing language for ToS/marketing
