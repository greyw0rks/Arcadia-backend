# MiniPay Constraints vs. Arcadia V2

**Date:** 2026-07-31
**Source:** `celopedia-skill` → `minipay-guide.md` (Important Constraints), `minipay-requirements.md`
**Status:** one blocker found, one design confirmed safe, several listing requirements open

MiniPay is 16M+ wallets and Arcadia already ships MiniPay-specific handling (`lib/useArcade.ts`),
so V2 has to work inside it. Checking the V2 designs against MiniPay's constraints turned up one
real blocker.

---

## ✅ RESOLVED 2026-07-31 — the V2 redeem flow now works in MiniPay

**MiniPay does not support `personal_sign` or `eth_signTypedData`.** They are not merely discouraged
— they are unsupported, and the submission checklist explicitly rejects apps that use them:

> "**No Message Signing** — do not prompt users to `personal_sign` or `eth_signTypedData` to access
> or authenticate. MiniPay does not support these methods."

`app/api/v2/access/redeem` was built on exactly that, so a tester opening the app in MiniPay could
not redeem their code — making invite-only V2 unreachable for most of the target audience.

**Fixed by option A: prove ownership with a transaction.** `server/v2/onchainProof.ts` issues a
short-lived nonce, the tester sends a 0-value self-transfer carrying it, and the backend verifies
on-chain that the transaction's `from` is the claimed address. A transaction is a signature the
chain witnessed, so the security property is unchanged — the wallet's key still had to authorise
something the server chose. The signature path is kept for non-MiniPay wallets; both are accepted.

**The design detail that matters: the invite code never goes on-chain.** Calldata is public from the
moment it hits the mempool, so a code in calldata could be copied and redeemed by an observer,
turning the proof into a race the legitimate tester can lose. Only the nonce is published, and it is
**bound to one address** — presenting an observed nonce from a different wallet fails. Tested
directly (`rejects a nonce presented by a different wallet`).

Other properties held by test: a transaction hash cannot be reused; a nonce is burned on success and
on a wrong-sender attempt; reverted transactions are rejected; and a not-yet-mined transaction does
**not** burn the nonce, so a tester polling ahead of the chain can retry rather than being stranded.

### The options that were considered

| Option | How it proves ownership | Verdict |
|---|---|---|
| **A. On-chain proof** ✅ | The tx is signed by the wallet, so `from` IS the proof | **Chosen.** Keeps the real security property, works in MiniPay, no new trust assumptions. Costs one tx at ~$0.0005, fee-abstracted into stablecoins |
| B. Code-as-bearer-token | Nothing — whoever holds the code gets access | Rejected: a leaked code becomes transferable |
| C. Detect and branch | Varies by client | Rejected: `isMiniPay()` is client-side and unverifiable server-side, so an attacker just takes the weaker path. Same security as B with twice the code |
| D. ODIS phone attestation | Phone → address via FederatedAttestations | Deferred: solves identity properly but is a large build. Revisit for the "no raw `0x…`" listing requirement |

---

## ✅ CONFIRMED SAFE — `ArcadiaPool.claim()` works in MiniPay

The pull-claim design in `ARCADIA_POOL_SCOPE.md` was worth re-checking, since "claiming" is exactly
the kind of flow MiniPay constrains. It holds up:

- A claim is a **normal contract call**, not a signature. MiniPay supports contract calls — the
  existing `startSession` / `settle` / `cancelExpired` calls already work.
- The **merkle proof is calldata**, not a signed message. The player signs a *transaction*, which is
  the one thing MiniPay does support.
- The **EIP-712 signature is produced server-side** (`server/signer.ts`) by the backend's signer key,
  never by the user's wallet. Same pattern V1 already uses in production.

Two MiniPay-specific requirements the claim UI must still honour:

1. **Legacy transaction type.** `lib/useArcade.ts` already passes `type: "legacy"` when
   `isMiniPay()` — the claim path must do the same or the tx will be rejected.
2. **No custom `feeCurrency`.** Also already handled: MiniPay manages fee currency itself.

**Action:** when the claim UI is built, route it through the existing `sendArcade`-style helper
rather than a fresh `writeContract` call, so both behaviours come for free.

---

## ⚠️ Listing requirements V2 will need

Not blockers for the private beta, but required before a MiniPay listing — and cheaper to build in
than retrofit:

- **Banned copy.** "Gas" → **Network fee**; "Crypto" → **Stablecoin**; "Onramp/Buy crypto" →
  **Deposit**; "Offramp" → **Withdraw**. Enforced at review.
- **Never display CELO.** Only USDT / USDC / USDm. Arcadia already stakes in those three.
- **No raw `0x…` as the primary identifier.** V2's leaderboard and weekly standings are the obvious
  risk — show usernames (the `player_profiles` table already exists) with truncated addresses only
  as a secondary hint.
- **Zero-click connect.** Already implemented (`ConnectControl.tsx` auto-connects and hides the
  button in MiniPay).
- **Low-balance → Add Cash deeplink** `https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT`
  instead of an error. Directly relevant to V2: a player who busts and wants to rebuy but has no
  balance should land on Add Cash, not a failure message.
- **360 × 640** minimum resolution, SVG/WebP images, 2MB bundle, PageSpeed 90+.
- **No `navigator.geolocation` on iOS** — hangs silently in MiniPay's WKWebView. Not currently used.

---

## What to do next

1. ~~Decide the redeem flow.~~ **Done — option A implemented** (`server/v2/onchainProof.ts`).
   The frontend still needs the two-step UI: request a proof nonce with `?player=0x…`, send the
   0-value transaction, then POST `{ code, player, proofNonce, txHash }`.
2. When building the claim UI, reuse the MiniPay-aware transaction helper.
3. Fold the copy rules and the Add Cash deeplink into the V2 UI as it is built.
