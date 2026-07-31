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

For the full reasoning — why the old mechanic failed, why fewer/bigger events fix it, and what
the pass mark trades off — see the decision record and spec §4.2/§5.2a.

---

## Build work

### 2. ~~`ArcadiaPool.sol`~~ — WRITTEN 2026-07-31

**Status:** implemented in `arcadia-contracts/celo/src/ArcadiaPool.sol`, 25 tests passing, with a
deploy script (`script/DeployPool.s.sol`). **Not yet deployed** — see #14.

→ **[`ARCADIA_POOL_SCOPE.md`](./ARCADIA_POOL_SCOPE.md)** for the design rationale.

The three open sub-questions are resolved:

- **Ranking submission: a backend-signed merkle root.** Push settlement is ~250M gas at 10k players
  against Celo's ~50M block limit, and the cost falls on the platform. A root is O(1) regardless of
  participant count.
- **Payouts pull, not push.** One player at a reverting address cannot block everyone else, and
  players can still claim if the backend is down.
- **Unclaimed rolls into the next week's pot** after a 4-week claim window, via a permissionless
  `sweepWeek`. Returning it to the platform would create an incentive to make claiming hard.

The property the contract is built around: **the pot is the ceiling.** No reserve, no solvency check
and no house exposure, because payouts for a week cannot exceed what that week took in. A wrong or
malicious root can at worst misallocate one week's pot — proven by test, not just by construction.

Also added beyond the original scope: `refund(weekId)` for the case where a week closes but results
are never published. Without it a backend failure at settlement would strand every entrant's money
permanently.

### 3. Weekly buy-in / bust / payout engine

**Status:** complete 2026-07-31. Rounds are scored server-side and entries are verified on-chain.
Remaining work is deployment, not code — see #14.

Shipped:

| Piece | What it does |
|---|---|
| `server/v2/db.ts` | `mustQuery` — throws instead of returning `null`, so a dropped connection during the tally aborts rather than silently omitting a player who is owed money |
| `server/v2/week.ts` | UTC week/day boundaries; `weekId` as `YYYYWW`, used on-chain |
| `server/v2/bands.ts` | §4.1 difficulty curve — unlocks the easy/medium banks V1 never serves |
| `server/v2/runs.ts` | Run lifecycle, round banking, bust detection |
| `server/v2/tally.ts` | Multipliers → payout amounts, integer-only |
| `server/v2/merkle.ts` | The tree `ArcadiaPool.claim()` verifies against |
| `server/v2/settle.ts` | Weekend tally → signed root, idempotent |
| `POST /api/v2/run` | Open a run (entry or rebuy) |
| `POST /api/v2/run/round` | Bank one scored round |
| `POST /api/v2/run/session` | Open a 15-question session belonging to the live run |
| `/v2/play` | The round UI — 15 questions, progress shown against the pass mark |

**Gap 3 — ~~the beta had no way to actually play a round~~ CLOSED 2026-08-01.** The run dashboard's
"Play a round" button pointed at V1's `/games`, which takes a per-session stake and settles on its
own. There was no route from a weekly run into a scored round.

`POST /api/v2/run/session` opens a session against the caller's live run, and `/v2/play` plays it.
Sessions carry a `weeklyRun` flag so V1's on-chain funding gate is skipped — the weekly entry already
paid. Deliberately **not** `isDemo`, which would skip the same gate but also exclude every answer
from the calibration sample (#5), which is the data the beta exists to gather.

Two bugs found and fixed while wiring this up:

- **The §4.1 difficulty curve was inverted.** The band was collapsed into V1's 0..1 `difficulty`
  fraction, but V1's `TIER_RECIPES` never serve easy or medium at *any* difficulty — that floor is
  the deliberate house-treasury protection `bands.ts` documents. So no fraction can express a V2
  band. Measured, the recovery band's `[4,7,4,0]` was served as `[0,0,11,4]`: the **hardest**
  questions to the players closest to bust, exactly reversing the recovery mechanic. Fixed by
  passing the recipe through as an explicit `tierSchedule`, threaded `createSession` → `nextRound` →
  `buildRound` → `drawTiered`. V1 omits it and is bit-identical; both directions are now tested.
- **`/api/round` returns `{ done, round, multiplierBp }`, not the view.** The play page read the
  body as the view itself, so every field was `undefined` and the question rendered blank.

Verified against a production build: both routes return **401** without a valid tester pass, reject
forged passes, and **404 in production** with `V2_ENABLED` unset. **#11 is closed** — `requireTester`
now has real call sites.

**Gap 1 — ~~rounds are client-scored~~ CLOSED 2026-07-31.** `POST /api/v2/run/round` now takes a
`sessionId` and reads the score from the server's own session state (`correctCount()`), which is
derived from the answer keys held in memory and never sent to the client. Four checks guard it:

- the session must belong to the wallet the pass proves (else a tester banks someone else's good run)
- the session must be **complete** (else a player abandons bad rounds and submits only good ones)
- it must be exactly 15 questions (else a 3-question session banks as a full round)
- **one session banks at most one round, ever** — a partial unique index on `session_id`

That last one is the non-obvious hole: the `(run_id, day, day_index)` constraint stops accidental
retries of the same slot, but a player could POST a finished 15/15 session repeatedly, taking the
next slot each time and banking unlimited +0.10x. The `session_id` index stops the replay; a repeat
submission returns the already-banked result with `replayed: true` instead of erroring.

**Gap 2 — ~~runs are still free~~ CLOSED 2026-07-31.** `server/v2/entry.ts` counts ArcadiaPool
`Entered` events of kind ENTRY/REBUY for the wallet and week, and requires strictly more paid
entries than runs already opened.

It deliberately does **not** use the contract's `contributed` mapping, which is the obvious choice
and is wrong: that aggregate includes $0.10 extra-round tickets, so ten ticket purchases would sum
to $1 and read as a free entry. Kind must be checked, not just value — which is why the event
carries it.

Comparing counts rather than consuming individual transactions keeps it stateless and idempotent: a
player who paid twice and opened once can open exactly one more run, whatever order requests arrive
in. Returns **402 Payment Required** when no unused entry exists.

Requires `ARCADIA_POOL_ADDRESS` on the deploy. Without it the check is skipped and the route logs a
warning, because a deploy in that state has a fictional economy.

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

**Note (2026-08-01):** the whole table above assumes rounds are served the §4.1 recipe. Until the
tier-schedule fix in #3 that was not true of served play — the curve was inverted, so easy/medium
were never drawn at all. The projections are still valid *for the intended curve*; they were simply
never what the code did. Nothing measured has been invalidated, because no beta rounds have been
played yet.

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

**Status:** blocked on a dashboard action only you can do — **and now also on #13.**

Five unused codes exist in `arcadia-contracts/celo/.env.staging.tester-codes` (expire
2026-08-27). The preview has Vercel Standard Protection on, so testers cannot load it
without a bypass token — Dashboard → `arcadia-celo` → Settings → Deployment Protection →
Protection Bypass for Automation. Not obtainable via CLI. Full steps in
[`V2_STAGING_HANDOFF.md`](./V2_STAGING_HANDOFF.md) §1.

**Second blocker found 2026-07-31, now fixed:** the redeem flow required a wallet signature, which
MiniPay cannot produce. Resolved by on-chain proof (#13) — but the **frontend redeem UI still needs
building** before codes can go out.

### 13. ~~MiniPay cannot sign the V2 redeem message~~ — FIXED 2026-07-31

**Backend done**, frontend UI still needed → **[`MINIPAY_V2_CONSTRAINTS.md`](./MINIPAY_V2_CONSTRAINTS.md)**.

MiniPay supports neither `personal_sign` nor `eth_signTypedData` — unsupported, and the listing
checklist rejects apps that use them. The redeem flow required exactly that, so testers in MiniPay
could not redeem at all.

Fixed with **on-chain proof** (`server/v2/onchainProof.ts`): the backend issues an address-bound
nonce, the tester sends a 0-value self-transfer carrying it, and the backend verifies on-chain that
the transaction's `from` is the claimed address. A transaction is a signature the chain witnessed,
so the security property is unchanged. The signature path is kept for non-MiniPay wallets — the
route accepts either.

The invite code never goes on-chain: calldata is public in the mempool, so a code there could be
copied and redeemed by an observer. Only the address-bound nonce is published, which is worthless to
anyone else. 16 tests cover nonce theft, tx replay, reverted txs, and the not-yet-mined case (which
deliberately does *not* burn the nonce, so a tester ahead of the chain can retry).

**Still to do:** the frontend two-step UI — request a nonce with `?player=0x…`, send the transaction,
then POST `{ code, player, proofNonce, txHash }`.

### 11. ~~`requireTester()` is written but has no call sites~~ — CLOSED 2026-07-31

**Wired in** when the first V2 gameplay routes landed (#3). `POST /api/v2/run` and
`POST /api/v2/run/round` both call it as their first line.

Verified against a production build: both return **401** without a pass and reject a forged one,
and both **404 in production** with `V2_ENABLED` unset while `/api/games` still returns 200.

The original finding, kept because the two-layer split is worth remembering:

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

**12c. ~~Make flagging difficulty-aware~~ — DONE 2026-07-31.** `server/v2/expectedAccuracy.ts`
compares a session's accuracy against what the **served tiers** make plausible, instead of a fixed
90%. `Session.servedTiers` carries the data; `classify()` takes it as an optional second argument
and behaves exactly as before when it is absent, so V1 is untouched.

The threshold is expected accuracy × 1.45 — the skill ceiling in `v2-bust-sim.py`'s population
model — capped just under 1 so a strong player scoring 100% on easy questions is never flagged on
accuracy alone. Speed remains what separates "good player" from "not reading the screen", and
sub-400ms answers still hard-flag regardless of difficulty.

Both directions are tested: an 87% recovery-band session stays clean (the false positive that
blocked enforcement), and an 87% all-extreme session is now caught — the old fixed threshold let
that through.

**This unblocks #12b/enforcement in principle, but the numbers are still assumptions.** P_TIER is
the same invented easy 85 / medium 65 / hard 45 / extreme 30. Re-derive from
`GET /api/admin/v2/calibration` before flipping `ANTICHEAT_ENFORCE`.

Also open: enforcement currently means "refuse to sign, stake refundable via `cancelExpired()`".
Under a weekly pool, decide explicitly what a flagged player forfeits and whether their stake stays
in the pool.

### 14. Deploy `ArcadiaPool` to staging

**Status:** script written (`arcadia-contracts/celo/script/DeployPool.s.sol`), never run.
**Blocks:** the entire beta economy — until this exists, `server/v2/entry.ts` cannot verify payment
and runs open for free.

```bash
cd arcadia-contracts/celo
forge script script/DeployPool.s.sol:DeployPool \
  --rpc-url https://forno.celo-sepolia.celo-testnet.org --broadcast
```

Env: `PRIVATE_KEY`, `TRUSTED_SIGNER` (must be the address the backend's key derives to — the script
asserts it is neither zero nor the deployer). Optional: `POOL_RAKE_BPS` (default 1500),
`CLAIM_WINDOW` (default 4 weeks).

Then:
1. Set `ARCADIA_POOL_ADDRESS=<deployed>` on the staging backend. **Without it the paid-entry check
   is skipped** — the route logs a warning but still opens runs.
2. Call `openWeek(weekId, token)` for the current week. `weekId` is `YYYYWW` from
   `server/v2/week.ts` — the two must agree or claims are built against a week with no pot.
3. Mint TestUSD to each tester wallet (mint is open by design).

Verify after: `getWeek(weekId)` shows `status = Open`, and a `POST /api/v2/run` without a paid entry
returns **402** rather than opening a run.

---

---

## Suggested order

**The code for the beta is written.** What remains is deployment, decisions, and things only you
can do.

### Blocked on you
1. **#14 — deploy `ArcadiaPool` to staging** and set `ARCADIA_POOL_ADDRESS`. Until then paid-entry
   verification is skipped and the economy is fictional.
2. **#10 — Vercel Protection Bypass token.** Dashboard-only, not obtainable via CLI. Nothing
   calibrates until testers can load the preview.
3. **#7 — one `setMaxStake` call per token** on the live mainnet contract. Owner key, real money.
4. **#9 — legal/compliance review** of the skill-game framing. Not a writing task.

### Unblocked engineering
5. **#4 — bank capacity.** At pass mark 9 the binding tier is `medium` (~4.1 weeks). Decide
   re-tagging vs. weighting vs. authoring.
6. **#12b — recalibrate anti-cheat thresholds** once beta data exists, then enable enforcement.
   `P_TIER` in `expectedAccuracy.ts` is still the invented set.
7. **#8 — scope private matches.** Entirely undefined; needs its own pass.

### Before mainnet, without exception
- Re-run `scripts/v2-bust-sim.py` against **measured** per-tier accuracy and revisit the pass mark.
- **Independent review of `ArcadiaPool.sol`.** It holds player money and I wrote both it and its
  tests.

## Done recently (context, not work)

Resolved: stake-tier question (single $1 entry, no tiers) · rebuy friction (15-min cooldown
+ nudge from the 4th) · format coverage against the 9 live games · the §4.1 difficulty curve
· the variance simulation that surfaced #1 · READMEs across all three repos · mobile token
switcher, tournament coming-soon page, and topbar spacing.
