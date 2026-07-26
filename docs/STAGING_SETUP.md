# V2 Staging Setup — Runbook

One-time dashboard work to stand up the isolated V2 staging environment. Everything here is
deliberately **separate from production**: separate Railway project, separate Neon project,
separate signer key, separate contract. A V2 bug must never be able to touch prod data or funds.

Prereqs already in place (branch `v2`):
- `proxy.ts` 404s all `/api/v2/*` unless `V2_ENABLED=true`
- Access-code gate (`server/accessGate.ts`, `/api/v2/access/redeem`, `/api/admin/v2/codes`)
- Boot guard: staging refuses to start if `DATABASE_URL` matches `PROD_DB_HOST_GUARD`

---

## 1. Neon — new project (NOT a branch of prod)

1. [console.neon.tech](https://console.neon.tech) → **New Project** → name `arcadia-v2-staging`.
   A *project*, not a branch of the prod project — branches share the parent's storage and it's
   one click to confuse them.
2. Copy the **pooled connection string** (the one with `-pooler` in the host).
3. Note the **prod** project's host (something like `ep-xxxx.<region>.aws.neon.tech`) — you need
   a substring of it for `PROD_DB_HOST_GUARD` below. The `ep-xxxx` part is ideal: unique to prod,
   short, and won't accidentally match the staging host.

## 2. Fresh settlement signer

Generate a keypair that has **never** touched production:

```bash
cast wallet new
# → Private key: 0x…   (SETTLEMENT_SIGNER_PRIVATE_KEY on the Railway staging service)
# → Address:     0x…   (TRUSTED_SIGNER for the contract deploy in step 3)
```

Do not reuse prod's `SETTLEMENT_SIGNER_PRIVATE_KEY`. The EIP-712 domain binds signatures to a
contract address, but the *key* isn't bound — a leaked or misused staging key must be worth
exactly the staging pool, which is zero-value TestUSD.

## 3. Staging contract deploy (TestUSD on Celo Sepolia)

From `arcadia-contracts/celo/`, with a throwaway deployer key funded from
[faucet.celo.org/celo-sepolia](https://faucet.celo.org/celo-sepolia) (Celo Sepolia, chain
11142220 — explorer: [celo-sepolia.blockscout.com](https://celo-sepolia.blockscout.com)):

```bash
cp .env.example .env.staging
# .env.staging:
#   PRIVATE_KEY=<throwaway deployer key, S-CELO funded>
#   TRUSTED_SIGNER=<address from step 2>
#   CUSD_ADDRESS=0x0000000000000000000000000000000000000000   # zero → deploys mintable TestUSD
#   MAINNET=false

set -a; source .env.staging; set +a
forge script script/Deploy.s.sol --rpc-url https://forno.celo-sepolia.celo-testnet.org --broadcast
```

Record from the output: **TestUSD address** and **QuizArcade address**. Testers get play money via
`TestUSD.mint(tester, amount)` — mint is open by design.

> Note: this deploys the *current* QuizArcade so the existing game loop works on staging
> end-to-end. The pool-economy contract (`ArcadiaPool.sol`, not yet written) will be a separate
> deploy later. Don't name it QuizArcadeV2 — that name is already taken by the multi-token
> rewrite in `src/QuizArcadeV2.sol`.

## 4. Railway — new PROJECT (not an environment)

Railway *environments* share a variable template and offer one-click promotion between them —
exactly the accident this setup exists to prevent. A separate project can't reference prod's
variables at all.

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** →
   `greyw0rks/Arcadia-backend`.
2. Service → **Settings → Source**: branch **`v2`**, auto-deploy on.
3. Service → **Variables** — set all of these:

| Variable | Value |
|---|---|
| `V2_ENABLED` | `true` (exactly lowercase — `TRUE` reads as off, verified) |
| `ARCADIA_ENV` | `staging` |
| `PROD_DB_HOST_GUARD` | the `ep-xxxx` fragment of the **prod** Neon host (step 1.3) |
| `DATABASE_URL` | staging Neon pooled connection string (step 1.2) |
| `SETTLEMENT_SIGNER_PRIVATE_KEY` | private key from step 2 — **never prod's** |
| `ADMIN_SECRET` | `openssl rand -hex 32` — distinct from prod's |
| `V2_GATE_SECRET` | `openssl rand -hex 32` — signs tester passes; without it nobody gets in |
| `NEXT_PUBLIC_CELO_NETWORK` | `testnet` |
| `NEXT_PUBLIC_RPC_URL` | `https://forno.celo-sepolia.celo-testnet.org` |
| `NEXT_PUBLIC_ARCADE_ADDRESS` | QuizArcade address from step 3 |
| `NEXT_PUBLIC_CUSD_ADDRESS` | TestUSD address from step 3 |
| `NEXT_PUBLIC_WC_PROJECT_ID` | same WalletConnect project id as prod (or a new one) |
| `NODE_VERSION` | `20` |

Leave unset: `BACKEND_URL` (this service serves its own API), all `TELEGRAM_*` (prod's bot must
not alert on staging noise — wire a separate bot later if wanted).

4. **Settings → Networking → Generate Domain** → note the URL (e.g.
   `arcadia-v2-staging.up.railway.app`).

## 5. Vercel — frontend preview for branch `v2`

In the **existing** frontend Vercel project (no fork needed — previews are isolated builds):

1. **Settings → Environment Variables** → add, scoped to **Preview** and *(where the UI allows)*
   the `v2` branch specifically:
   - `BACKEND_URL` = the Railway staging URL from step 4.4
   - `NEXT_PUBLIC_V2_ENABLED` = `true`
   - `NEXT_PUBLIC_CELO_NETWORK` = `testnet`
   - `NEXT_PUBLIC_ARCADE_ADDRESS` / `NEXT_PUBLIC_CUSD_ADDRESS` = step-3 addresses
2. Push a `v2` branch on `Arcadia-frontend` (`git checkout -b v2 && git push -u origin v2`) —
   Vercel builds a preview URL for it automatically.
3. **Settings → Deployment Protection**: enable **Standard Protection** for previews — a second,
   dumb layer in front of the real gate. Share the bypass with testers along with their code.

## 6. Verify the isolation before letting anyone in

```bash
STAGE=https://<railway-staging-domain>
PROD=https://arcadia-api-production.up.railway.app

# Dark switch: V2 exists on staging, not in prod
curl -s -o /dev/null -w '%{http_code}\n' $STAGE/api/v2/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' $PROD/api/v2/health    # 404

# Gate: no pass → no entry (401 comes from the gate, not the proxy)
curl -s -o /dev/null -w '%{http_code}\n' $STAGE/api/v2/access/redeem  # 200 (nonce endpoint is open)

# Guard drill (optional but worth doing once): set staging's DATABASE_URL to the PROD string,
# redeploy, hit any DB route — it must 500 with
#   "[bootstrap] FATAL: staging deploy is pointed at the production database"
# in the logs. Restore the staging string after.
```

## 7. Mint tester codes

```bash
curl -s -X POST $STAGE/api/admin/v2/codes \
  -H "x-admin-secret: $STAGING_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"label":"first-wave", "maxUses":1, "expiresInDays":30}'
# → {"code":"arcv2-…"}
```

Send each tester: the preview URL, the Vercel protection bypass, and their code. They redeem once
(wallet signs a nonce), get a 7-day pass cookie, and are in. Revoke anytime:

```bash
curl -s -X DELETE $STAGE/api/admin/v2/codes \
  -H "x-admin-secret: $STAGING_ADMIN_SECRET" \
  -H "content-type: application/json" \
  -d '{"player":"0x…"}'      # or {"code":"arcv2-…"} to kill a code and all its wallets
```

Revocation is immediate — the gate re-checks the allowlist on every request, not just at pass
issuance.

---

## What this does NOT cover

- **The pool economy itself** — `ArcadiaPool.sol` and the weekly buy-in/bust/payout engine are
  not written yet. This runbook only stands up the fence around where they'll live.
- **Real-money testing.** Staging is TestUSD on Celo Sepolia by design. Before any mainnet pool
  with real stakes: audit pass on the pool contract, the `V2_MAX_POOL` circuit breaker, and the
  regulatory/skill-game framing review flagged in `docs/ARCADIA_V2_ECONOMY_SPEC.md` §7.5.
- **Scaling past one Railway replica.** The gate's in-memory allowlist mirrors `blacklist.ts` and
  assumes a single process; a second replica wouldn't see a revocation until redeploy. Known,
  acceptable at current scale, revisit before scaling out.
