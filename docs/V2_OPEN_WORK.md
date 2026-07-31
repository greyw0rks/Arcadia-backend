# V2 — Open Work Handoff

**Date:** 2026-07-29
**Branch:** `v2` (backend) · frontend `main` · contracts `main`
**Supersedes nothing** — this is the task list, not a status report.
For environment/deploy state see [`V2_STAGING_HANDOFF.md`](./V2_STAGING_HANDOFF.md);
for the economy design see [`ARCADIA_V2_ECONOMY_SPEC.md`](./ARCADIA_V2_ECONOMY_SPEC.md).

---

## The one that blocked the others

### 1. ~~Sign off (or reject) the §4.2 scoring rework~~ — DONE 2026-07-31

**Signed off in full**, all three parts as proposed → **[`V2_SCORING_DECISION.md`](./V2_SCORING_DECISION.md)**.

- One **±0.10x move per round**, replacing ±0.01x per question (70 events/week instead of 1,050).
- **Pass mark 9 of 15** → ~24% bust, best payout spread (4.50×), 4.1 weeks of bank runway.
- **Purchased rounds are upside-only** — can gain, never subtract.

Implemented in `server/v2/scoring.ts`, tunable via `V2_PASS_MARK` without a redeploy. **#2, #3 and
#4 are now unblocked.**

What was locked is the *structure*, not the economy. Every number still rests on four invented
per-tier accuracies — re-run `scripts/v2-bust-sim.py` against measured values and revisit the pass
mark before mainnet.

The original design — multiplier moves ±0.01x per question — **does not work.** Simulation
(`scripts/v2-bust-sim.py`, spec §5.2a) showed three structural failures:

- Bust rate cliffs from 85% to 0.2% across one step of player skill. No difficulty setting
  produces the 30–35% the revenue model assumes.
- The self-correcting difficulty curve drifts *upward* at low multipliers, so busting from
  0.30x needs roughly a 7-sigma run of bad luck.
- Final multipliers span only 1.56× from p1 to p99, so a pool split by multiplier barely
  discriminates between players.

Root cause is the ratio `√K · (d/s)` — 1,050 questions of ±0.01x makes drift swamp variance.
Reducing the daily allowance does not fix it (noise falls as `√K`, drift as `K`); only
coarser events do.

**The proposal (spec §4.2):** one **±0.10x move per round**, gated on **≥9 of 15 correct**.
70 events instead of 1,050. Bust rate becomes a smooth dial — 1.8% / 8.4% / 23.8% / 48.2% /
73.0% at pass marks 7/8/9/10/11 — and payout spread rises to ~4.5×.

**Also needs an explicit yes:** purchased extra rounds must be **upside-only** (can gain,
never subtract). Under symmetric scoring a player spending $14/week on extra rounds *raises
their own bust probability by ~8 points* while the platform rakes every ticket. That is a
predatory pattern and must not ship.

**Caveat that matters:** every number rests on invented per-tier accuracies (easy 85% /
medium 65% / hard 45% / extreme 30%) and an assumed skill distribution. The *shape* is
validated — a tunable dial exists — the specific pass mark is not. The instrumentation to
replace those four numbers with measured ones is now live (#5); it needs tester play, not
more code. Sign-off can proceed on the shape, but **re-run `scripts/v2-bust-sim.py` against
the measured accuracies before the pass mark is final.**

---

## Build work

### 2. `ArcadiaPool.sol`

**Status:** not started. Nothing exists. **UNBLOCKED 2026-07-31** — #1 is signed off, so final
standing is now defined: per-round ±0.10x on a ≥9/15 pass mark, bust at zero (`server/v2/scoring.ts`).

Weekly pooled buy-in contract: entries, rebuys, extra-round tickets, rake split, weekend
settlement to a ranked set of players.

Do **not** extend `QuizArcade.sol`. It is a house-treasury model — the house pays each
session from its own reserve. The pool model is structurally different: players fund the
pot and the contract redistributes it. Note also that `src/QuizArcadeV2.sol` is an *earlier
draft* than `QuizArcade.sol` despite the name; neither is the right base.

Open sub-questions: how ranking is submitted on-chain (single signed merkle root vs.
per-player claims), whether payouts push or pull, and what happens to an unclaimed share.

### 3. Weekly buy-in / bust / payout engine

**Status:** not started. **UNBLOCKED 2026-07-31** — #1 signed off; the scoring rule it needs is in
`server/v2/scoring.ts`.

Backend counterpart to #2: daily section allowance, multiplier tracking, bust detection,
progressive difficulty selection, weekend tally.

Three constraints already established:

- `server/db.ts` runs `MIGRATIONS` on **every startup**, so V2 DDL must live in a separate
  file or merging to `main` creates V2 tables in the production database.
- `server/db.ts` `query()` returns `null` on error and callers read `null` as "no data" —
  unsafe for money tables. Needs a different accessor.
- The existing `TIER_RECIPES` in `server/games/choiceGame.ts` never serves easy or medium
  questions at any stake. V2 needs that floor removed (spec §4.1) — safe **only** because
  payouts come from a player pool rather than house funds. If any V2 mode ever pays from
  house funds, the floor must come back.

### 4. Question-bank capacity

**Status:** re-measured 2026-07-31. **UNBLOCKED** — #1 is signed off at pass mark 9, which fixes
which tier is scarce. Decision now ready to make.

A maximally active player consumes 1,050 questions/week. The original analysis divided each bank
by an even split across formats and concluded the five smallest banks last ~3 weeks. That
understates it, because the §4.1 difficulty curve draws from a **tier within a bank**, not from the
bank. The binding constraint is a tier cell.

Run `node scripts/bank-capacity.mjs` for current figures. As of 2026-07-31:

| Multiplier band | Binding tier | Weeks |
|---|---|---|
| 2.21+ (elite) | `extreme` | **1.2** |
| 0.01–0.50 (recovery) | `easy` | **1.6** |
| 1.61–2.20 | `extreme` | 1.9 |
| 0.51–0.90 | `medium` | 3.0 |
| 0.91–1.20 (baseline) | `medium` | 3.5 |
| 1.21–1.60 | `extreme` | 3.3 |

Total pool: 443 easy · 1,456 medium · 2,009 hard · 921 extreme.

Three things make this sharper than a content-backlog item:

- **The two ends of the curve are the two scarcest cells.** The elite band burns 11 extreme
  questions per round from a pool of 921. A winning player is exactly who sits there, so the
  highest earners hit repeats first — and repeats inflate accuracy, pushing them further up. The
  mechanic meant to pull strong players back toward breakeven decays first.
- **`emoji` and `capitals` have zero easy questions.** `tiersNearTarget` substitutes medium —
  ~27% of the recovery band's easy slots in those two formats, 0% elsewhere. So that band already
  serves slightly harder questions than §4.1 models, before any exhaustion. It does **not** corrupt
  #5's data (`drawTiered` records the tier actually served, not the one requested); it makes the
  band's modelled drift optimistic. Fix is content, not code.
- **It corrupts #5's calibration sample.** Measured per-tier accuracy drifts above true
  first-sighting accuracy once repeats begin, so the numbers meant to replace the invented
  parameters inherit the bias. **Clean measurement window: roughly the first 3 weeks**, shorter for
  anyone who climbs.

Sustaining 12 weeks at the worst band would need ~8,300 more extreme and ~2,900 more easy
questions.

**But the worst band is not the realistic case — and the pass mark decides which tier binds.**
`python3 scripts/v2-bust-sim.py` now simulates a whole population and reports tier consumption:

| Pass mark | Bust rate | Scarcest tier | Runway |
|---|---|---|---|
| 7 / 15 | 1.8% | `extreme` | **2.9 wk** |
| 8 / 15 | 8.4% | `hard` | 4.4 wk |
| **9 / 15** (recommended) | 23.8% | **`medium`** | **4.1 wk** |
| 10 / 15 | 48.2% | `medium` | 4.6 wk |
| 11 / 15 | 73.0% | `easy` | 5.8 wk |

Extreme consumption swings 23× across that range (321 → 14 questions per player-week), because a
lenient mark lets everyone climb into the extreme-heavy bands and park, while a harsh one keeps
resetting them to 1.0x where recipes are medium/hard-weighted.

**Resolved by the #1 sign-off: pass mark 9 means `medium` is the binding tier, at ~4.1 weeks.**
That inverts the "grow extreme" read the worst-case table suggests — at realistic occupancy the
pressure sits mid-curve, because that is where a resetting population spends its time. `medium` is
also the second-largest pool (1,456), which is the healthiest case available.

Options now that the target is known: re-tag toward `medium` (cheapest), flatten the curve's
extremes, weight toward the large banks and `math`, or cap purchased volume.

### 5. ~~Instrument per-tier accuracy in the beta~~ — DONE 2026-07-29

**Shipped.** The sampler is live on the V2 branch; it needs testers, not more code.

Every scored answer now writes one row to `calibration_samples` (tier served, correct, on-time,
response ms, session difficulty, game, player). The tier is threaded from the bank draw through
`RoundState.tier` to `scoreAnswer` — previously the tier was known at pick time and discarded before
scoring, so accuracy could not be attributed to a difficulty at all.

Read it with `GET /api/admin/v2/calibration?minAnswers=20` (same `ADMIN_SECRET` as the other admin
routes). It returns:

- **`byTier`** — the four numbers §4.1 invents (easy 85% / medium 65% / hard 45% / extreme 30%).
  Every bust rate and pass mark in §4.2 is provisional until these are real.
- **`byGame`** — per-format accuracy, which says whether the tier tags mean the same thing across
  banks or whether one format's "hard" is another's "medium".
- **`skill`** — per-player accuracy, descending. The *spread* of this drives platform bust rate more
  than any individual's luck (§5.2a), so read the distribution, not the mean.

Three properties worth knowing before relying on the data:

- **V2-only.** The table is created from `initV2Schema()` and `recordSample()` returns early unless
  `V2_ENABLED`, so it exists on the private-tester staging deploy and nowhere else. No production
  player is sampled, and merging to `main` creates nothing.
- **Demo plays are excluded from the aggregate** (still recorded, flagged `is_demo`). A free session
  has nothing at stake, so its answers aren't drawn from the same effort distribution as a paid one.
- **`tier` is NULL for `math`** — it generates questions rather than drawing from a tagged bank, so
  it contributes to `byGame` and `skill` but not to `byTier`.

Note the timeout distinction: an out-of-time answer is scored wrong but recorded `on_time = false`,
so a tier that looks hard because the timer is too short can be told apart from one that is hard
because the question is. `scaleTimer` shrinks the timer as difficulty rises, which makes this
confound real rather than hypothetical.

**Still open:** nothing in code. This is now blocked on #10 — testers have to actually play.

---

## Smaller / independent

### 6. ~~Reconcile the stale mainnet `TRUSTED_SIGNER`~~ — DONE 2026-07-29

**Resolved.** Investigated and closed; recorded here because the conclusion is worth keeping.

The contract was *deployed* with `0x0A4Da252…` and later rotated via `setSigner` to
`0x350FA35efe85Bfce23Bdc090fF9dF0686fdab26b`; `.env` kept recording the original. **Production
was never broken** — the backend's signing key derives to the rotated address, which matches
`trustedSigner()` on chain exactly. So this was stale documentation, not an outage.

The real exposure was a *future* deploy: `Deploy.s.sol` feeds `TRUSTED_SIGNER` straight into
the constructor, so redeploying from the stale value would have baked in a signer the backend
does not hold, and every `settle()` would revert with `BadSignature`. `.env` now carries the
correct address, and the deploy script asserts the signer is non-zero and not the deployer key
(contracts PR #2).

### 7. On-chain `maxStake` vs. app-enforced cap

**Status:** deploy script fixed; **the live contract still needs a transaction.** Not blocked.

The live contract's `maxStake` for USDm is `5e18` ($5) while the app enforces $1
(`server/difficulty.ts`). The app is the stricter of the two, so this is a consistency gap
rather than a live drain vector — difficulty clamps correctly and solvency accounting holds
— but a transaction sent directly to the contract could stake up to $5.

The deploy script's defaults were the source (`5e18`/`5e6` in both the mainnet and testnet
branches) and now mirror the backend at $1, so a fresh deploy is correct. **The already-deployed
mainnet contract is unchanged** — closing this needs an owner-key `setMaxStake` call per token:

```
cast send 0xFb2F048B9A088D6ef0Cf3413B90F4Cef76D0eb49 "setMaxStake(address,uint256)" \
  0x765DE816845861e75A25fCA122bb6898B8B1282a 1000000000000000000 \
  --rpc-url https://forno.celo.org --private-key <owner key>
```

…and the same for USDC and USDT at `1000000` (6 decimals). Owner is
`0xc61Bbc0CF5694EF410A578A9833f77C173790450`. Verify after with
`cast call … "maxStake(address)(uint256)"`.

### 8. Scope private matches

**Status:** entirely undefined.

Named in the spec as a second revenue stream with no mechanics attached. Needs its own
pass: buy-in structure, pooled vs. peer-to-peer, whether it reuses the difficulty/format
system, and how rake applies.

### 9. Skill-game framing for ToS and marketing

**Status:** not started. Do before public launch, not after.

Pooled buy-in + skill-weighted scoring + delayed cash payout needs deliberate framing given
cash payouts and Nigeria-based operations. Two decisions already help the argument and
should be cited: the single flat $1 entry (money cannot buy a larger share) and
progressive difficulty (outcomes track skill). Wants a real legal/compliance review, not
just copywriting.

### 10. Distribute tester codes

**Status:** blocked on a dashboard action only you can do.

Five unused codes exist in `arcadia-contracts/celo/.env.staging.tester-codes` (expire
2026-08-27). The preview has Vercel Standard Protection on, so testers cannot load it
without a bypass token — Dashboard → `arcadia-celo` → Settings → Deployment Protection →
Protection Bypass for Automation. Not obtainable via CLI. Full steps in
[`V2_STAGING_HANDOFF.md`](./V2_STAGING_HANDOFF.md) §1.

### 11. `requireTester()` is written but has no call sites

**Status:** found 2026-07-29 while auditing "V2 is testers-only". Not blocked, but small.

V2 is meant to be private-beta only. The **outer** gate is real and verified working — see below —
but the **inner** one is not yet connected:

`app/api/v2/_gate.ts` implements the two-layer per-tester check (valid HMAC pass + still on the
allowlist) and documents itself as "call as the FIRST line of every /api/v2 route handler". But
`grep -rn requireTester` returns only the definition and its own doc comment. Nothing calls it.

Nothing is currently exposed by this: the only routes under `/api/v2` today are `health` (returns a
boolean) and `access/redeem` (the route that *issues* the pass, so it authenticates by wallet
signature instead). The problem is the default — any V2 gameplay route added for #3 is unprotected
unless someone remembers this file exists. Wire it in as those routes land.

**Corrected — the dark switch is fine.** An earlier revision of this section claimed `middleware.ts`
was missing and that the `/api/v2` tree was reachable in production. That was wrong. The gate is
`proxy.ts` at the repo root (Next 16 deprecated the `middleware.ts` convention in favour of it); it
matches `/api/v2/:path*` and `/v2/:path*` and 404s both unless `V2_ENABLED=true`. Verified live on
2026-07-29: prod `/api/v2/health` and `/api/v2/access/redeem` both 404 while prod `/api/games`
returns 200. The misleading comment in `app/api/v2/health/route.ts` that named the wrong file has
been fixed.

Note the deliberate split, which is why the inner gate still matters: `proxy.ts` runs on the edge
runtime and cannot reach Postgres, so it can only answer "does V2 exist on this deploy?" — never
"is this caller allowed?". Only the route handlers can do the latter.

### 12. Anti-cheat: every system active in V2

**Status:** audited 2026-07-31 → **[`V2_ANTICHEAT_AUDIT.md`](./V2_ANTICHEAT_AUDIT.md)**.
Splits into three pieces with different blockers.

V1's posture is detect-only. The goal for V2 is every mechanism active. The audit found detection
is already fully live — what is off is *enforcement* (one env var, `ANTICHEAT_ENFORCE`, gating both
the sub-400ms rejection and settlement refusal) and the clawback sweep, which is built but has no
scheduler.

**12a. ~~Schedule the clawback sweep~~ — DONE 2026-07-31.** `server/clawbackScheduler.ts`, started
from `ensureBooted()` after hydration. Runs every 6h (`CLAWBACK_SWEEP_MINUTES`, 0 disables).

**Report-only by default, deliberately.** The sweep bans wallets at ≥3 hard flags, and those flags
come from thresholds that have never been validated against real play (12b). Auto-banning on top of
unvalidated criteria turns three uncertain judgements into one certain ban with no human in the
loop, so the default is to alert the operator with candidates and Blacklist buttons. Set
`CLAWBACK_AUTO_ENFORCE=true` to actually ban.

Two guards worth knowing: the **first run after any restart always previews**, because
`getRepeatOffenders()` has no time window and flags have accumulated since 2026-07-17 under
detect-only — an unattended first run would act on the whole backlog at once. And the env flag is
strict `=== "true"`, so a typo fails closed. `POST /api/admin/clawback` remains the deliberate
enforcement path; `GET` now also reports the scheduler's config.

**12b. Recalibrate the flag thresholds — blocked on beta data (#5, #10).** `FLAG_ACCURACY = 0.9` was
set against V1's hard/extreme floor, where honest accuracy is 30–41%, leaving huge headroom. §4.1
unlocks easy/medium and honest accuracy rises to 51–65% at average skill — and **a strong player in
the recovery band expects 87% at the simulator's own skill cap, three points off the flag**, meaning
about half such sessions clear it on expectation alone. That cohort is exactly the wrong one to
false-positive: someone who already busted and paid another $1. Enabling enforcement on V2's curve
without re-tuning risks refusing legitimate payouts, which under a pooled model is visible to every
player at the weekend tally. The calibration sampler already records the accuracy *and* timing
distributions needed to set these properly.

**12c. Make flagging difficulty-aware.** Structural fix: one global accuracy threshold cannot serve
a curve whose honest accuracy ranges 51–65% by design. Compare a session against expected accuracy
for the bands it was actually served — `RoundState.tier` and `calibration_samples` already carry the
data. Sits alongside #3.

Also open: enforcement currently means "refuse to sign, stake refundable via `cancelExpired()`".
Under a weekly pool, decide explicitly what a flagged player forfeits and whether their stake stays
in the pool.

---

## Suggested order

1. **#10** — the sampler (#5) is built but collects nothing until testers play, and it is the
   only item that produces data rather than consuming it. **#12b also depends on this data.**
2. **#2 and #3** — the two big builds, now unblocked by the #1 sign-off. Wire **#11**
   (`requireTester`) in as those routes land, and **#12c** alongside.
3. **#4** — unblocked and cheap: at pass mark 9 the binding tier is `medium`. Can run in parallel
   with the builds.
4. **#12b then enforcement** once beta data exists. Do not flip `ANTICHEAT_ENFORCE` before it.
5. **#7** before any mainnet work — one `setMaxStake` call per token. (#1, #5, #6 and #12a done.)
6. **#8 and #9** before public launch.

## Done recently (context, not work)

Resolved: stake-tier question (single $1 entry, no tiers) · rebuy friction (15-min cooldown
+ nudge from the 4th) · format coverage against the 9 live games · the §4.1 difficulty curve
· the variance simulation that surfaced #1 · READMEs across all three repos · mobile token
switcher, tournament coming-soon page, and topbar spacing.
