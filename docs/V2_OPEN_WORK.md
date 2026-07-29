# V2 — Open Work Handoff

**Date:** 2026-07-29
**Branch:** `v2` (backend) · frontend `main` · contracts `main`
**Supersedes nothing** — this is the task list, not a status report.
For environment/deploy state see [`V2_STAGING_HANDOFF.md`](./V2_STAGING_HANDOFF.md);
for the economy design see [`ARCADIA_V2_ECONOMY_SPEC.md`](./ARCADIA_V2_ECONOMY_SPEC.md).

---

## The one that blocks the others

### 1. Sign off (or reject) the §4.2 scoring rework

**Status:** proposed, simulated, awaiting a decision.
**Blocks:** #2, #3, and any sizing of the revenue model.

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

**Status:** not started. Nothing exists.
**Blocked by:** #1 — settlement shape depends on how final standing is computed.

Weekly pooled buy-in contract: entries, rebuys, extra-round tickets, rake split, weekend
settlement to a ranked set of players.

Do **not** extend `QuizArcade.sol`. It is a house-treasury model — the house pays each
session from its own reserve. The pool model is structurally different: players fund the
pot and the contract redistributes it. Note also that `src/QuizArcadeV2.sol` is an *earlier
draft* than `QuizArcade.sol` despite the name; neither is the right base.

Open sub-questions: how ranking is submitted on-chain (single signed merkle root vs.
per-player claims), whether payouts push or pull, and what happens to an unclaimed share.

### 3. Weekly buy-in / bust / payout engine

**Status:** not started.
**Blocked by:** #1.

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

**Status:** measured, decision open. Not blocked — can start now.

A maximally active player consumes 1,050 questions/week. Five of the nine live banks are
exhausted in under a month:

| Bank | Size | Weeks to exhaust |
|---|---|---|
| `trivia` | 1,546 | ~13 |
| `truefalse` | 1,069 | ~9 |
| `riddles` | 612 | ~5 |
| `emoji` / `oddoneout` / `capitals` / `geo` / `landmark` | ~310–340 | **~3** |
| `math` | procedural | never |

Repeats are not just a content problem — a second sighting is effectively easier, which
inflates accuracy and works against progressive difficulty. **Either** grow the small banks
toward ~1,000 each, **or** weight round composition toward the large banks and `math` and
accept a less even format mix.

This now also contaminates #5: a tester who exhausts the ~310-entry banks in three weeks starts
answering questions they have already seen, and those inflated answers land in
`calibration_samples` indistinguishable from first sightings. If the beta runs longer than about
three weeks, either grow the small banks first or read `byGame` with that in mind.

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

---

## Suggested order

1. **#10** — the sampler (#5) is built but collects nothing until testers play, and it is the
   only item that produces data rather than consuming it.
2. **#1** — unblocks the two big builds. Everything else is downstream. Sign off the shape now;
   re-check the pass mark once #5 has real accuracies.
3. **#4** in parallel — not blocked, and repeat exposure biases #5's numbers upward.
4. **#2 and #3** once #1 is settled — wire **#11** in as those routes land.
5. **#7** before any mainnet work — one `setMaxStake` call per token. (#5 and #6 are done.)
6. **#8 and #9** before public launch.

## Done recently (context, not work)

Resolved: stake-tier question (single $1 entry, no tiers) · rebuy friction (15-min cooldown
+ nudge from the 4th) · format coverage against the 9 live games · the §4.1 difficulty curve
· the variance simulation that surfaced #1 · READMEs across all three repos · mobile token
switcher, tournament coming-soon page, and topbar spacing.
