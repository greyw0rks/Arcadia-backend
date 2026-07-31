# ArcadiaPool.sol — Design Scope

**Date:** 2026-07-31
**Status:** implemented — `arcadia-contracts/celo/src/ArcadiaPool.sol`, 25 tests passing
**Depends on:** §4.2 scoring (signed off 2026-07-31)
**Resolves:** the three open sub-questions in `V2_OPEN_WORK.md` #2

---

## Why not extend `QuizArcade.sol`

`QuizArcade.sol` is a **house-treasury** contract and V2 is a **player-funded pool**. The difference
is not cosmetic — it inverts who is at risk.

| | QuizArcade (V1) | ArcadiaPool (V2) |
|---|---|---|
| Payout source | House reserve | Other players' entries |
| Per-entry commitment | Reserves `stake × maxMult` up front | Nothing to reserve — pot is the cap |
| Solvency risk | House can be drained by skilled play | Structurally impossible: payouts ≤ pot |
| Settlement | Per session, immediately | Once weekly, across all entrants |
| Failure mode | Insolvency | Mis-ranking |

V1 must lock `effectiveStake × maxMult` per session because a winning player is paid from house
funds. V2 has no such reserve: the pool is the ceiling, so the contract cannot pay out more than it
took in. **That is the single most important property to preserve** — it makes the contract
trivially solvent by construction, and no ranking bug can drain it beyond the week's pot.

`src/QuizArcadeV2.sol` is an *earlier* draft than `QuizArcade.sol` despite the name. Neither is the
right base. This is a new contract.

---

## Decision 1 — settlement shape: signed merkle root

**Chosen: the backend publishes one merkle root per week; players claim against it.**

The alternative — the backend pushing a payout to each player — does not survive contact with gas:

| Players | Push settlement | Merkle root |
|---|---|---|
| 100 | 2.5M gas | 60k gas |
| 1,000 | 25M gas | 60k gas |
| 10,000 | **250M gas** | 60k gas |

Celo's block gas limit is roughly 50M. Push settlement stops being possible somewhere around a few
thousand players, and the cost falls entirely on the platform. A merkle root is **O(1) on-chain
regardless of participant count**, and each player pays their own claim gas — which also means the
platform's settlement cost does not grow with success.

Reuses the existing trust model: the backend already holds an EIP-712 signer that the contract
trusts (`trustedSigner`). The root is signed the same way, so no new trust assumption is introduced.

**What this gives up:** players must actively claim. Addressed in Decision 3.

## Decision 2 — payouts are pull, not push

Follows from Decision 1, but worth stating separately because it is also the safer choice on its own.

A push loop over winners is a well-known footgun: one player at a contract address that reverts on
receive, or simply consumes too much gas, and the entire settlement transaction fails — blocking
everyone else's payout. Pull isolates failure to the individual claimant.

It also removes the platform from the critical path. If the backend is down at settlement time,
players can still claim from an already-published root.

## Decision 3 — unclaimed shares roll into the next week's pot

The three options and why this one:

| Option | Problem |
|---|---|
| Return to platform | Creates an incentive to make claiming hard. Not acceptable. |
| Burn / lock forever | Wastes real player money for no benefit. |
| **Roll into next week's pot** | Keeps funds with players; needs a claim window. |

Unclaimed value stays on the players' side of the ledger and enlarges the following week's prize —
which is a mild but honest retention mechanism, and the platform's rake was already taken at entry.

**Claim window: 4 weeks.** Long enough that a casual player who misses a weekend is not punished,
short enough that funds are not stranded indefinitely. After it closes, anyone may call `sweepWeek`
to fold the remainder forward — permissionless, so it does not depend on the operator.

---

## Structure

```
Week lifecycle:
  openWeek(weekId, token)        owner   — starts entry
  enter(weekId) / rebuy(weekId)  player  — pull entry fee, rake to treasury, rest to pot
  buyRounds(weekId, n)           player  — extra-round tickets, same rake split
  closeWeek(weekId)              owner   — no more entries
  publishResults(weekId, root, signature)  — backend-signed merkle root
  claim(weekId, amount, proof)   player  — pull payout, once
  sweepWeek(weekId)              anyone  — after the window, roll remainder forward
```

**Merkle leaf:** `keccak256(abi.encode(weekId, player, amount))`. The `weekId` binds a proof to its
week so a valid proof cannot be replayed against a later root; `amount` is absolute, not a share, so
the contract never divides.

**Invariant to hold and to test:** `sum(claims) ≤ pot(weekId)`. The contract tracks `claimed` per
week and rejects a claim that would exceed the pot, so a buggy or malicious root can at worst
misallocate that week's pot — never reach another week's funds or the treasury.

---

## What the contract deliberately does NOT do

- **It does not compute rankings.** Multiplier tracking, bust detection and the pass-mark rule live
  in the backend (`server/v2/scoring.ts`). Putting the §4.1 difficulty curve on-chain would freeze a
  set of parameters that are explicitly expected to change weekly.
- **It does not know about multipliers.** It receives final amounts. That keeps the economy tunable
  without redeploying a money contract.
- **It does not hold house funds.** No reserve, no solvency check, no `fundPool` equivalent needed
  for correctness — though sponsor top-ups (spec §5.5) can be added as a pot contribution later.

---

## Open questions for implementation

1. ~~**Rake timing.**~~ Resolved: taken at entry, straight to `freeTreasury`, remainder to the pot.
   Matches V1 and spec §5.1.
2. **Can a player enter more than one week concurrently?** Weeks are independent by construction, so
   the contract allows it. The backend must not let a player hold two live runs in the same week.
3. ~~**Emergency path.**~~ Resolved by not having one. V1 needs `emergencyWithdraw` because the house
   holds funds it may legitimately need to recover; here every token beyond `freeTreasury` belongs to
   a player-funded pot. `pause()` therefore blocks new entries only — claims, refunds and sweeps keep
   working, so a pause can never strand player money. Tested.
4. ~~**Refunds if a week is never published.**~~ Implemented as `refund(weekId)`: once a week has been
   closed for longer than the claim window with no root, entrants recover their net contribution.
   Without this a backend failure at settlement would strand every entrant permanently — the pot has
   no owner and no other exit.

## What the tests pin down

25 tests, including a 256-run fuzz over claim amounts. The ones that matter:

- **`test_potIsTheCeiling_claimsCannotExceedPotEvenWithBadRoot`** — publishes a deliberately
  over-allocated root (every player assigned the whole pot) and proves the second claim reverts.
  This is the property the design rests on: even a compromised signer can only misallocate one
  week's pot, never reach another week or the rake treasury.
- **`test_proofFromOneWeekIsWorthlessInAnother`** — `weekId` is inside the leaf, so proofs cannot be
  replayed across weeks.
- **`test_pauseBlocksEntriesButNotClaims`** — the pause cannot trap funds.
- **`test_ownerWithdrawsRakeOnlyNeverThePot`** — after a full rake withdrawal, the contract balance
  still exactly equals the pot.
- **`test_unclaimedRollsForwardNotToThePlatform`** — sweeps are permissionless and land in a live
  week using the same token.
