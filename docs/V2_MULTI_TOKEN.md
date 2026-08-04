# V2 Multi-Token Entry — Design Decision (USDm / USDC / USDT)

**Date:** 2026-08-04
**Status:** ✅ RESOLVED 2026-08-04 — **Ranked (V2) is single-token cUSD/USDm.** Multi-token belongs to
Casual (V1). No per-token-pool build needed. Original analysis kept below for the record.

## Resolution — Casual vs Ranked

Two modes, deliberately different economies:

| | **Casual** (V1) | **Ranked** (V2) |
|---|---|---|
| Model | Instant win/lose, per-session stake | Weekly pooled buy-in, skill-weighted payout |
| Entry | $0.10–$1 per game | **$0.50 flat/week** |
| Tokens | **USDm, USDC, USDT** (all three) | **cUSD/USDm only** |
| Deploy | production (`arcadia-celo`) | staging (isolated Railway + DB) |

Rationale for USDm-only Ranked:
- cUSD/USDm is celopedia's canonical **Mento Dollar** (`0x765DE816845861e75A25fCA122bb6898B8B1282a`),
  18-dp, and is already `DEFAULT_CELO_TOKEN` in `lib/contract.ts`. It is also its **own** CIP-64
  fee-currency (no adapter), so a player can pay gas in the same token they enter with.
- The pool is **single-token-per-week by construction** (`openWeek(weekId, token)`), and a single
  competitive pot is the cleanest skill-game framing — one asset, one leaderboard, one payout.
- Casual already carries the multi-token requirement, so nothing is lost: a player who wants to
  play in USDC/USDT does so in Casual.

**Consequence for the deploy:** `openWeek(currentWeekId(), USDm)` — one token, one week, done. The
three-parallel-pool design below is **not** being built.

---

## (Superseded) Original analysis — why mixing tokens in one pot is impossible



- `lib/contract.ts` `CELO_TOKENS` defines all three: USDm (18-dp), USDC (6-dp), USDT (6-dp),
  with decimals, labels, and CIP-64 fee-currency addresses.
- The backend signer (`server/signer.ts`) binds the token address into the EIP-712 message, so a
  signature for one token can't be replayed against another.
- `server/v2/economy.ts` `toBaseUnits(usd, decimals)` produces the correct $0.50 entry amount for
  each token's decimals (5e17 for USDm, 5e5 for USDC/USDT).

## The blocker: the pool is single-token-per-week

`ArcadiaPool.openWeek(weekId, token)` binds **exactly one token** to a week, and the whole
settlement path is token-blind:

- `weekId` is `YYYYWW` (`server/v2/week.ts`) — no token dimension.
- `weekly_runs` / `weekly_payouts` key on `(weekId, player, chain)` — no token column.
- `settle.ts` builds one merkle root over one pot per `weekId`.

You **cannot** mix tokens in one pot. Winners are paid the *absolute* leaf amount in the week's
single `w.token`; a USDC entrant's contribution and a USDm entrant's contribution are different
assets with different decimals and different real value. Paying a USDC winner from a USDm pot would
either overpay/underpay by ~1e12× or drain another asset — and it breaks the invariant the whole
contract is built on (**the pot is the ceiling**, one asset per week). This is not a bug to patch;
it is the design boundary.

## Recommended model: three parallel per-token pools

Run one pot **per (week, token)**. A player who enters with USDT competes against other USDT
entrants for the USDT pot; USDm entrants compete for the USDm pot. Each pot independently satisfies
pot-is-the-ceiling. No oracle, no swap, no house exposure — consistent with the existing design.

Implementation (the remaining build; deliberately **not** done in this pass because it touches
money-tally code and warrants its own review):

1. **Token-salt the weekId** so three pots coexist without a contract change. The contract only
   requires `weekId` uniqueness; use e.g. `weekId = YYYYWW * 10 + tokenIndex` (0=USDm, 1=USDC,
   2=USDT). `week.ts` gains `weekIdFor(at, token)` and `weekEnd` strips the salt. The merkle leaf
   already binds `weekId`, so cross-pool replay stays impossible for free.
2. **Add a `token` column** to `weekly_runs` and `weekly_payouts` (in `server/v2/schema.ts`, V2-only
   DDL — never `server/db.ts`).
3. **`settle.ts` loops per token**, one root per (week, token), each `publishResults` call against
   that pot's salted weekId.
4. **`entry.ts`** already checks `Entered` events for the wallet+week; scope its `ARCADIA_POOL_*`
   read to the token the run was opened with.
5. **Operator opens three weeks** each Monday: `openWeek(saltedId, tokenAddr)` × 3.
6. **Frontend**: the existing token switcher picks the token; the run is opened against that pot.

Alternative considered and rejected: **single settlement token** (everyone pays in USDm). Simplest,
but it fails the actual requirement ("get in with USDm, USDT, or USDC") and pushes an FX/swap step
onto the player. Rejected.

## Staging env (Sepolia) for whatever tokens are enabled

On testnet all three token addresses default to the zero address unless set. The staging deploy must
provide, per enabled token, a deployed mintable test ERC-20 (mint is open by design, per
`V2_OPEN_WORK.md` #14):

- `NEXT_PUBLIC_CUSD_ADDRESS` — TestUSDm (18-dp)
- `NEXT_PUBLIC_TOKEN_ADDRESS_USDC` — TestUSDC (6-dp)
- `NEXT_PUBLIC_TOKEN_ADDRESS_USDT` — TestUSDT (6-dp)

Then `pool.enableToken(addr, true)` for each, and `openWeek` per token once the per-token weekId
scheme (step 1) is in.
