# V2 Anti-Cheat — Activation Audit

**Date:** 2026-07-31
**Trigger:** decision that V2 should run every anti-cheat system active, rather than V1's detect-only posture.
**Status:** audit complete; one blocking recalibration identified before enforcement can be switched on.

---

## What is actually inactive

Six mechanisms exist. Only **one** is genuinely dormant; the rest are active, and the distinction
matters because "turn everything on" is a one-line change for the dormant one and a *recalibration*
for the others.

| # | Mechanism | State today | Gate |
|---|---|---|---|
| 1 | Fast-answer rejection (`< 400ms`) | **detect-only** | `ANTICHEAT_ENFORCE` |
| 2 | Session classification (clean/suspect/flagged) | **active** — always runs, always logs | none |
| 3 | Settlement refusal on a hard flag | **detect-only** | `ANTICHEAT_ENFORCE` |
| 4 | Operator alerts (Telegram, with Blacklist button) | **active** | none |
| 5 | Wallet blacklist | **active**, manual | operator action |
| 6 | Statistical clawback sweep | **scheduled 2026-07-31, report-only** | `CLAWBACK_AUTO_ENFORCE` |

So the accurate statement is: **detection is fully live and always has been. Enforcement is off, and
the clawback sweep has no trigger.**

### The one true gap — clawback had no scheduler ✅ FIXED 2026-07-31

`runClawbackSweep()` auto-blacklists any wallet with ≥3 hard flags. It is reachable from
`POST /api/admin/clawback` and the Telegram bot, and it is idempotent with a dry-run mode — but
nothing called it on a schedule. It only ran if someone remembered to press it.

`server/clawbackScheduler.ts` now runs it every 6h from `ensureBooted()`. **Report-only by
default**: it alerts the operator with candidates and Blacklist buttons rather than banning, because
its 3-flag threshold sits on top of the uncalibrated thresholds described below — auto-banning there
would turn three uncertain judgements into one certain ban with nobody in the loop.
`CLAWBACK_AUTO_ENFORCE=true` enables real banning; even then the **first run after a restart always
previews**, since `getRepeatOffenders()` has no time window and would otherwise act on the entire
backlog accumulated since 2026-07-17 in one pass.

### The rest is one env var

`ANTICHEAT_ENFORCE=true` activates both #1 and #3 together — they share the single gate. Flipping it
is trivial. **Whether it is safe to flip is the actual question**, and the answer changed when V2
changed the difficulty curve.

---

## Why enforcement was left off — and why V2 makes it riskier, not safer

The flag rule fires on **high accuracy AND high speed**:

```
accuracy >= 90%  AND  (60%+ answers under 900ms  OR  mean response under 1200ms)
```

The 90% accuracy threshold was chosen against **V1's difficulty floor**, where only hard and extreme
questions are ever served. Expected honest accuracy there:

| Context | Honest expected accuracy |
|---|---|
| V1 level 0 (low stake) | 41% |
| V1 level 3 (high stake) | 30% |

Against a 30–41% baseline, 90% is enormous headroom — a legitimate player essentially cannot reach
it, so the rule is nearly false-positive-free by construction.

**§4.1 unlocks the easy and medium banks**, and that headroom shrinks:

| V2 band | skill 1.0 | skill 1.3 | skill 1.45 (sim cap) |
|---|---|---|---|
| 0.01–0.50 (recovery) | 65% | 81% | **87%** |
| 0.51–0.90 | 60% | 76% | 83% |
| 0.91–1.20 (baseline) | 51% | 66% | 74% |

A skilled player rebuilding from near-bust is served the easiest recipe in the game. At the skill
ceiling the simulator itself uses (1.45σ, a plausible strong tester), honest expected accuracy in the
recovery band is **87% — three points below the flag threshold**, before any luck. And that is the
*expected* value: roughly half of such sessions land above it. The cohort at risk is precisely the
one where a false positive hurts most — someone who already busted once and paid another $1.

**The speed half is a weaker guard than it looks in V2.** `scaleTimer` shrinks the per-round timer as
difficulty rises, which trains players to answer faster; and easy questions are answered faster by
honest players anyway. Both conditions drift toward the flag together.

> **Conclusion: enabling `ANTICHEAT_ENFORCE` on V2's curve without re-tuning the thresholds risks
> refusing settlement to legitimate strong players.** Under V2 that is worse than under V1 — the
> money is a pooled buy-in from other players, and a wrongly-blocked payout is visible to the whole
> pool at the weekend tally.

---

## Recommended sequencing

The goal — every system active — is right. The order matters because thresholds tuned on V1's
difficulty distribution do not transfer to V2's.

**1. Schedule the clawback sweep.** No recalibration needed, no false-positive exposure (it requires
≥3 independent hard flags, and the operator gets an Undo button). Do this now.

**2. Re-derive the flag thresholds from beta data before enabling enforcement.** The calibration
sampler (§4.1, shipped 2026-07-29) already records per-answer accuracy *and* response time per tier
— which is exactly the distribution needed. Set `FLAG_ACCURACY` and the speed thresholds from the
measured honest population, not from V1-era assumptions. Concretely: take the 99th percentile of
honest accuracy per band and put the threshold above it.

**3. Make the flag rule difficulty-aware.** A single global accuracy threshold cannot serve a curve
whose honest accuracy ranges 51–65% by design. The classifier should compare a session against the
expected accuracy **for the bands that session was actually served** — the data to do this is already
on `RoundState.tier` and in `calibration_samples`. This is the structural fix; #2 is the stopgap.

**4. Then enable `ANTICHEAT_ENFORCE`.** With thresholds derived from real play and a difficulty-aware
rule, enforcement becomes safe to turn on — which is the stated goal.

**Consider also:** enforcement currently means *refuse to sign*, leaving the stake refundable via
`cancelExpired()`. Under a weekly pool that story is murkier than under V1's per-session model —
worth deciding explicitly what a flagged V2 player forfeits, and whether their stake stays in the
pool.

---

## What this changes in the plan

Add to [`V2_OPEN_WORK.md`](./V2_OPEN_WORK.md):

- **Clawback scheduler** — small, unblocked, do now.
- **Anti-cheat recalibration** — blocked on beta data (#5/#10), and must land before enforcement.
- **Difficulty-aware flagging** — design work, sits alongside the weekly engine (#3).

Nothing here blocks the §4.2 scoring decision; the dependency runs the other way, since the pass mark
shapes which bands players occupy and therefore what honest accuracy looks like.
