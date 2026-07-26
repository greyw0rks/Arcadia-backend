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

## 3. XP / Multiplier Mechanic

- Buy-in funds count toward a starting multiplier baseline.
- XP accrues through correct answers under time/difficulty pressure.
- Multiplier grows with sustained correct performance; higher stakes face tougher questions, creating a natural skill/risk curve.
- XP and multiplier are **specific to the current entry** — see reset behavior below.

---

## 4. Floor / Bust Mechanic

- Each user has a performance **floor** (e.g., XP/accuracy threshold, or consecutive-miss threshold — exact definition TBD in difficulty calibration).
- Hitting the floor = **bust**: the user's current stake is forfeited and they are removed from active play.
- Forfeited stake is **not refunded and not clawed back into platform revenue** — it stays in the weekly pool, increasing the eventual payout for surviving players. This mirrors poker rebuy-tournament economics rather than house-edge extraction.
- To resume playing that week, the user must **rebuy** at the flat $1 rate.

### Rebuy behavior
- Price: flat $1, no escalation regardless of how many times a user rebuys in a week.
- XP/multiplier: **full reset** on rebuy. Each entry is a fresh run — no carried-over progress from the busted attempt.
- Rebuy cap: **open question** — uncapped rebuys maximize volume/revenue but need at least a soft friction point (cooldown timer, in-app nudge after N rebuys) to avoid predatory-pattern optics. Needs a decision before launch.

---

## 5. Revenue Model

### 5.1 Revenue mechanism
Platform revenue = **rake taken at every entry event** (initial buy-in AND every rebuy), not at payout. This is the primary and — under the current design (forfeited stakes return to pool, flat rebuy price, no other cash extraction point) — effectively the **only** revenue lever, aside from secondary streams below.

```
Gross weekly volume = (early-bird entries × early price)
                     + (regular entries × $1)
                     + (total rebuys × $1)

Platform revenue    = Gross weekly volume × rake %
Weekly pool payout  = Gross weekly volume × (1 − rake %)
```

### 5.2 Why the difficulty/floor curve IS the revenue lever
Because forfeited stakes stay in the pool (not platform revenue) and rebuys are flat-priced, **volume is the only thing that moves revenue** — and volume is driven by the bust rate:

- Floor too lenient → few busts → few rebuys → low volume.
- Floor too harsh → players bust and churn instead of rebuying → also low volume.
- Target: a floor that's beatable-but-tense — high enough perceived stakes that busted players want another shot, not so brutal it reads as unfair.

This means difficulty/floor calibration is a **product decision with direct revenue consequences**, not purely a game-design one. Needs dedicated modeling once question-difficulty tiers are defined (separate from this doc).

### 5.3 Illustrative model (rake = 15%, directional only)

| Weekly active users | Early-bird mix | Bust rate | Avg rebuys/busted user | Gross volume | Platform revenue | Pool paid out |
|---|---|---|---|---|---|---|
| 1,000 | 20% @ $0.70 | 30% | 1.5 | $1,390 | ~$208 | ~$1,182 |
| 5,000 | 20% @ $0.70 | 30% | 1.5 | $6,950 | ~$1,042 | ~$5,908 |
| 20,000 | 20% @ $0.70 | 35% | 1.8 | $32,720 | ~$4,908 | ~$27,812 |

At 20k weekly actives: ~$19–25k/month in pure rake, before secondary revenue. **These numbers are placeholders for structure validation — real bust rate and rebuy behavior are unknown until playtested.**

### 5.4 Secondary revenue (not primary, not yet modeled)
- **Float yield**: pooled stablecoins sit for up to a week before payout — deployable into Aave/Morpho for yield during that window. Marginal until pool size is consistently large; worth having, not worth relying on early.
- **Sponsor-funded pool top-ups**: sponsors add to the weekly pool in exchange for branded question packs / placement in harder tiers. Subsidizes payouts without raising rake.
- **Free/XP-only tier**: no buy-in, no cash payout, funnels volume into paid tiers; can carry light sponsor placement.

---

## 6. Design Decisions Locked So Far

| Decision | Choice |
|---|---|
| Forfeited stake destination | Returns to weekly pool (not platform revenue) |
| Rebuy pricing | Flat $1, no escalation |
| XP/multiplier on rebuy | Full reset |
| Rake collection point | At every entry event (initial + rebuys), not at payout |

## 7. Open Questions

1. Does a separate "stake tier" axis exist above the $1 flat rate (i.e., can users buy in higher than $1 for harder difficulty / bigger multiplier ceiling), or is difficulty purely performance-driven within a single $1 entry?
2. Exact floor definition — XP threshold, consecutive misses, accuracy %, or a composite?
3. Rebuy cap or soft friction (cooldown, nudge) — none currently specified.
4. Target bust rate to calibrate toward (drives both game feel and revenue — see §5.2).
5. Regulatory framing — pooled buy-in + skill-weighted scoring + delayed cash payout needs a deliberate "skill game" framing (ToS, marketing language) given cash payouts and Nigeria-based operations. Not addressed in this spec; flag for separate legal/compliance pass.

---

## 8. Next Steps

- [ ] Resolve stake-tier question (§7.1) — determines whether difficulty scaling has one axis or two
- [ ] Define floor mechanic precisely (§7.2)
- [ ] Model bust-rate sensitivity against difficulty curve once question tiers are scoped
- [ ] Decide rebuy cap/friction policy
- [ ] Draft skill-game framing language for ToS/marketing
