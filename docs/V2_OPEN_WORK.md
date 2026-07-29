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
validated — a tunable dial exists — the specific pass mark is not.

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

### 5. Instrument per-tier accuracy in the beta

**Status:** not started. Not blocked — should ship *with* the first tester build.

Record accuracy per question tier and per format from day one. These four numbers are the
only free parameters in the entire difficulty model, and everything in §4.1/§4.2 is
provisional until they are real. Also capture the **skill distribution** across testers —
platform bust rate is driven more by skill spread than by individual luck.

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

---

## Suggested order

1. **#1** — unblocks the two big builds. Everything else is downstream.
2. **#4 and #5** in parallel with it — neither is blocked, and #5 must ship with the first
   tester build or the calibration data is lost.
3. **#10** to get testers actually playing, which is what produces #5's data.
4. **#2 and #3** once #1 is settled.
5. **#7** before any mainnet work — one `setMaxStake` call per token. (#6 is done.)
6. **#8 and #9** before public launch.

## Done recently (context, not work)

Resolved: stake-tier question (single $1 entry, no tiers) · rebuy friction (15-min cooldown
+ nudge from the 4th) · format coverage against the 9 live games · the §4.1 difficulty curve
· the variance simulation that surfaced #1 · READMEs across all three repos · mobile token
switcher, tournament coming-soon page, and topbar spacing.
