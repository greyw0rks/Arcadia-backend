# ArcadiaPool.sol — Internal Security Audit

**Date:** 2026-08-04
**Auditor:** in-house review (Claude), guided by the celopedia `security-patterns.md`
Celo-specific playbook.
**Scope:** `arcadia-contracts/celo/src/ArcadiaPool.sol` @ current `v2` tree.
**Status of the gate:** This is the *internal* pre-mainnet review (open-work item #1's
"independent review"). **It is not a substitute for a paid external audit.** The contract
holds player money and the same author wrote both it and its tests; a third-party review by
the Pashov Audit Group `solidity-auditor` / `x-ray` skills (linked from
`security-patterns.md`) or an equivalent firm is still required before mainnet.

---

## Verdict

The core invariant — **the pot is the ceiling** — holds. Owner cannot reach player pots;
each week is single-token; claims/refunds/sweeps all decrement a shared `claimed` counter
bounded by `pot`, so the contract cannot be made insolvent for a week. Reentrancy,
access-control, and signature-replay posture are all sound.

**One real accounting bug found (M-1):** `refund()` and `publishResults()` are not mutually
exclusive, which under a late-publish sequence lets a refunded player also claim. Bounded by
the pot, so it is a fairness/tally-integrity bug, not contract insolvency. Fix recommended
before mainnet. Two lower-severity notes below.

---

## Findings

### M-1 (Medium, low-likelihood) — refund and publish are not mutually exclusive

`refund()` (line 333) requires `status == Closed` and opens at `closedAt + claimWindow`.
`publishResults()` (line 240) requires `status == Closed` **with no upper time bound**. So if
the operator publishes results *after* the refund window has already opened and some players
have refunded:

- `refund()` sets `contributed[week][player] = 0` and bumps `w.claimed`, but does **not** set
  `hasClaimed`.
- `claim()` checks `hasClaimed` and the merkle proof, but never reads `contributed`.

A player who already refunded and is also in the published root can therefore **claim a second
time**. Total outflow is still bounded by `pot` (both paths share `w.claimed`, and `claim`'s
defence-in-depth `amount > pot - claimed` holds), so the contract cannot be drained below the
week's intake — but the double-dip comes out of *other* players' claimable share and corrupts
the tally.

**Reachability:** requires `publishResults` to fire more than `claimWindow` (default 4 weeks)
after `closeWeek`. That is an operational error, not a normal path, which is why this is
low-likelihood — but it is real money.

**Recommended fix (pick one):**
- In `publishResults`, reject once the refund window is open:
  `if (block.timestamp > w.closedAt + claimWindow) revert ClaimWindowClosed(...)`. Cleanest —
  makes "never published in time" a terminal state that only refunds can drain.
- Or give refunds a distinct `WeekStatus.Refunding` set on the first refund, and make
  `publishResults` reject it.

### L-1 (Low) — fee-on-transfer / rebasing tokens would desync accounting

`_contribute` (line 413) credits `net = amount - rake` from the **`amount` argument**, not from
a measured balance delta. Per celopedia `security-patterns.md` §2 (CIP-64 fee abstraction),
this is actually the *correct* choice for fee-abstracted gas — the fee-currency debit happens
out-of-band and a balance-delta snapshot could be corrupted by it, so trusting `amount` is
right. The residual risk is narrower: a **fee-on-transfer or rebasing** token would deliver
less than `amount` while the contract credits the full `net`, over-allocating the pot.

**Mitigation already present:** `enableToken` is owner-gated, and the intended tokens (USDm,
USDC, USDT) are none of these. **Keep it that way** — never `enableToken` a token without
confirming it is a plain, non-fee-on-transfer, non-rebasing ERC-20. Worth a one-line comment on
`enableToken`.

### L-2 (Low / informational) — CELO duality guard is present but partial

`enableToken` correctly rejects `CELO_ERC20` (line 365), matching celopedia
`security-patterns.md` §1 (CELO's native + ERC-20 duality). The contract never reads
`address(this).balance`, so stray native CELO cannot corrupt accounting. No action needed;
noted for completeness.

---

## What was checked and is sound

- **Pot-is-ceiling:** `pot += net` on contribute; `publishResults` rejects `totalPayout > pot`;
  `claim` rejects `amount > pot - claimed`; `sweepWeek` sets `claimed = pot`. Cumulative outflow
  across claim+refund+sweep is bounded by `pot` because all three share `w.claimed`.
- **Reentrancy:** every token-moving external fn is `nonReentrant` and uses `SafeERC20`;
  effects precede interactions in `claim` and `refund`.
- **Access control:** lifecycle/treasury/config are `onlyOwner`; `publishResults` is
  signature-gated (EIP-712, permissionless caller); `claim`/`refund`/`sweep` permissionless by
  design so player funds never depend on the operator.
- **Signature replay:** EIP-712 domain binds name/version/chainId/verifyingContract; a published
  week cannot be re-published (status guard). A claim leaf binds `weekId`, so cross-week replay
  is impossible.
- **Owner cannot touch pots:** `withdrawFree` is bounded by `freeTreasury[token]` (rake only);
  no owner path transfers `pot`.
- **Cross-decimal safety:** each week is single-token; `sweepWeek` requires same token, so a
  6-decimal USDC pot can never be folded into an 18-decimal USDm pot.
- **Rake rounding:** integer `amount * rakeBps / BPS` rounds rake down (player-favourable); no
  dust-drain, no overflow at realistic amounts.

---

## Before mainnet (unchanged from `V2_OPEN_WORK.md`)

1. Fix **M-1**.
2. Commission a **third-party audit** — this internal review does not replace it.
3. Re-run `scripts/v2-bust-sim.py` against **measured** per-tier accuracy (from the staging
   beta) and revisit the pass mark.
