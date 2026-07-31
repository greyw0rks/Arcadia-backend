# V2 Scoring — Decision Record (§4.2)

**Date raised:** 2026-07-31
**Decide by:** before `ArcadiaPool.sol` or the weekly engine starts
**Status:** ⬜ awaiting sign-off
**Evidence:** `scripts/v2-bust-sim.py` · spec §4.2, §5.2a, §3.1b

This is the blocker on items #1–#3 of [`V2_OPEN_WORK.md`](./V2_OPEN_WORK.md), and (since 2026-07-31)
on #4 as well. Three questions. Answer each yes, or amend it — then this file becomes the record of
why, and the spec gets updated to match.

---

## Why a decision is needed at all

The shipped design moves the multiplier **±0.01x per question**. At 15 questions × 10 rounds ×
7 days that is 1,050 multiplier events per week, and simulation (§5.2a) showed that many events
destroys the mechanic:

- Noise across the week is `0.01 × √1050` ≈ **±0.32x**, while a 2-percentage-point accuracy edge
  produces **0.42x** of drift. Signal beats noise by construction, so the final multiplier is
  essentially a deterministic readout of accuracy.
- **Bust rate cliffs** from 85% to 0.2% across one step of player skill. No difficulty setting
  produces the 30–35% the revenue model assumes.
- **Payout spread collapses** to 1.56× p1→p99, so splitting a pool by multiplier barely
  discriminates between players.

Two repairs were simulated — a neutral recovery band, and per-round decay — and both reproduced the
same cliff. The problem is the step-size-to-volume ratio, not the recipe values, so it cannot be
tuned away.

---

## Decision 1 — move to per-round scoring

**Proposal:** one **±0.10x** move per round, replacing ±0.01x per question. 70 events per week
instead of 1,050.

**Why this size.** For an additive walk of `K` events with step `s` and per-event drift `d`, luck
only matters when `√K · (d/s)` is near or below 1:

| Design | K | step | dominance |
|---|---|---|---|
| per-question, 10 rounds/day | 1,050 | 0.01 | **1.30** — accuracy determines everything |
| per-question, 5 rounds/day | 525 | 0.01 | 0.92 — halving volume barely helps |
| **per-round, 10 rounds/day** | **70** | **0.10** | **0.33** — variance survives |

Cutting the daily allowance was the intuitive fix and it does almost nothing, because noise falls as
`√K` while drift falls as `K`. Only changing event granularity moves the ratio.

**What it commits you to.** This is the structural one — `ArcadiaPool.sol` and the weekly engine get
built around per-round settlement. Reversing it later means reworking both.

**What survives unchanged:** the §4.1 difficulty bands, bust-at-zero, the $1 rebuy with full reset,
and per-question feedback in the UI (it just stops moving the banked multiplier).

**Risk if wrong:** low. The failure being fixed is measured and structural. The residual risk is
that per-round feels less responsive to players — mitigated by keeping live per-question feedback
in the round UI.

☐ **Approve** ☐ Amend: ................................................................

---

## Decision 2 — pass mark 9 of 15

**Proposal:** a round gains +0.10x on **≥9 of 15 correct**, otherwise −0.10x. Start at 9.

Population simulation, 15,000 players, skill ~ N(1.0, 0.15):

| Pass mark | Bust rate | Median | Spread | Bank runway | Scarcest tier |
|---|---|---|---|---|---|
| 7 / 15 | 1.8% | 1.40 | 4.25× | 2.9 wk | `extreme` |
| 8 / 15 | 8.4% | 1.20 | 3.67× | 4.4 wk | `hard` |
| **9 / 15** | **23.8%** | 0.80 | **4.50×** | **4.1 wk** | `medium` |
| 10 / 15 | 48.2% | 0.80 | 3.50× | 4.6 wk | `medium` |
| 11 / 15 | 73.0% | 0.60 | 6.00× | 5.8 wk | `easy` |

**Why 9.** Bust rate is now a smooth, monotonic function of a single integer — a target rate is
reachable by choosing it, which was the whole failure of the old mechanic. 9 gives ~24%, slightly
below the 30–35% the revenue model assumed, **deliberately**: it is far better to launch lenient and
tighten with real data than to bust testers out of the beta and lose the accuracy measurements that
calibrate everything else. It also has the best payout spread (4.50×).

**It holds up on the bank lens too** (§3.1b). 4.1 weeks of runway comfortably exceeds the ~3 weeks
of clean calibration data needed, and the binding tier is `medium` — the second-largest pool at
1,456 questions. Pass 7 is the one to avoid: 2.9-week runway *and* a 1.8% bust rate that generates
almost no rebuy volume.

**What it commits you to.** Very little. This is a single integer in config, tunable per week
without a redeploy. **It must be treated as a live economic parameter, not a constant.**

**Risk if wrong:** low and cheap to correct — but note the number rests on invented per-tier
accuracies (easy 85% / medium 65% / hard 45% / extreme 30%). Re-run the simulation against measured
values (`GET /api/admin/v2/calibration`) before mainnet.

☐ **Approve 9/15** ☐ Amend to ......../15

---

## Decision 3 — purchased rounds are upside-only

**Proposal:** rounds bought beyond the free daily allowance can gain +0.10x but **never subtract**.

| Rounds/day | Weekly spend | Bust (symmetric) | Bust (upside-only) |
|---|---|---|---|
| 10 (free) | $0.00 | 23.8% | 23.8% |
| 20 | $7.00 | 28.5% | **12.0%** |
| 30 | $14.00 | 31.9% | **8.1%** |

**Why this is not optional.** Under symmetric scoring a player spending $14/week to play more
**raises their own bust probability by ~8 points** while the platform takes rake on every ticket.
Paying money to make your own ruin more likely is a textbook predatory pattern. It should not ship
regardless of what it earns.

**It is also better for the pool.** A player paying 14× the entry fee for roughly 1.9× the median
multiplier is *subsidising* the pool, since tickets are raked into it. Free rounds stay symmetric,
so the core game keeps its tension.

**Second-order effect to watch:** upside-only lets heavy buyers climb faster, which slightly
increases time spent in the extreme-heavy bands and shortens bank runway. Small at current volumes;
re-check if extra-round purchase rates come in high.

☐ **Approve** ☐ Amend: ................................................................

---

## What happens on approval

1. Spec §4.2 changes from PROPOSED to locked; §4's per-question rule and §6's "Scoring granularity"
   row are updated to match.
2. #1 clears, which unblocks **#2** (`ArcadiaPool.sol`), **#3** (weekly engine) and **#4**
   (bank capacity — the pass mark decides which tier to grow).
3. The pass mark lands as a single config constant, documented as weekly-tunable.
4. `scripts/v2-bust-sim.py` gets re-run against measured per-tier accuracy once the beta has data,
   and the pass mark is revisited before any mainnet exposure.

## What is still assumption-bound after approval

Every number here rests on the four invented per-tier accuracies and an assumed skill distribution
(σ = 0.15). **The mechanic's shape is validated — a smooth, tunable dial exists — the specific pass
mark is not.** Approving this fixes the structure and starts the builds; it does not finalise the
economy. That waits on beta data.
