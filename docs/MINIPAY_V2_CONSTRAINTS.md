# MiniPay Constraints vs. Arcadia V2

**Date:** 2026-07-31
**Source:** `celopedia-skill` → `minipay-guide.md` (Important Constraints), `minipay-requirements.md`
**Status:** one blocker found, one design confirmed safe, several listing requirements open

MiniPay is 16M+ wallets and Arcadia already ships MiniPay-specific handling (`lib/useArcade.ts`),
so V2 has to work inside it. Checking the V2 designs against MiniPay's constraints turned up one
real blocker.

---

## 🔴 BLOCKER — the V2 tester redeem flow cannot work in MiniPay

**MiniPay does not support `personal_sign` or `eth_signTypedData`.** They are not merely discouraged
— they are unsupported, and the submission checklist explicitly rejects apps that use them:

> "**No Message Signing** — do not prompt users to `personal_sign` or `eth_signTypedData` to access
> or authenticate. MiniPay does not support these methods."

`app/api/v2/access/redeem` is built on exactly that. Its comment states the reasoning plainly:

> "The signature is the whole point: an allowlist cannot trust a body-supplied address (anyone can
> send a tester's wallet), so the wallet must sign the code+nonce message."

The reasoning is sound and the security property is real — but **it cannot be satisfied inside
MiniPay**. A tester opening the app in MiniPay cannot redeem their code. Since V2 is invite-only,
that means V2 is currently unreachable for MiniPay users, which is most of the target audience.

### Options

| Option | How it proves ownership | Cost |
|---|---|---|
| **A. On-chain proof** — redeem by sending a tiny transaction (or calling a `redeem(code)` method) | The tx is signed by the wallet, so `msg.sender` IS the proof | Costs a transaction; MiniPay covers fees via fee abstraction, so the user pays no CELO. Strongest option, and it reuses the existing tx path that already works in MiniPay |
| **B. Code-as-bearer-token** — drop the signature, treat the code itself as the secret | Nothing — whoever holds the code gets access | Weakest. A leaked code is transferable. Acceptable *only* because codes are one-use grants for a closed beta, not something protecting funds |
| **C. Detect and branch** — signature outside MiniPay, on-chain or bearer inside | Varies by client | Two auth paths to maintain and test; the weaker one becomes the attack surface |
| **D. ODIS phone attestation** | Phone → address via FederatedAttestations | Heaviest; solves identity properly but is a large build |

**Recommendation: A.** It preserves the actual security property (the wallet demonstrably signed
something), works in MiniPay today, and needs no new trust assumptions. The cost is one cheap
transaction on a chain where fees are ~$0.0005 and MiniPay abstracts them into stablecoins.

**This is a decision, not something to silently pick.** Recorded here rather than implemented.

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

1. **Decide the redeem flow** (A–D above). Blocks MiniPay testers entirely, so it gates #10.
2. When building the claim UI, reuse the MiniPay-aware transaction helper.
3. Fold the copy rules and the Add Cash deeplink into the V2 UI as it is built.
