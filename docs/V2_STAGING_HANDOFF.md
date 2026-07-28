# V2 Staging — Handoff

**Date:** 2026-07-28
**Status:** Staging environment is live and verified end-to-end. Tester codes minted.
Blocked only on distributing them (needs a Vercel protection bypass token).

---

## 0. What exists now

| Thing | Value |
|---|---|
| Staging API | `https://arcadia-v2-api-production.up.railway.app` |
| Frontend preview | `https://arcadia-celo-gy1qxlks0-greyw0rks-projects.vercel.app` |
| Railway project | `arcadia-v2-staging` (project ID `a10f907d-cf36-4ed6-a7b1-45e6cea4c1d0`), service `arcadia-v2-api`, branch `v2` |
| Neon | project `arcadia-v2-staging`, host `ep-square-snow-ax3q4cc6-pooler` (prod is `ep-old-credit-awx3dcd3`) |
| QuizArcade (Celo Sepolia) | `0x312EbFf9cA16a17dc9F60958D27F51f4d7E9608D` |
| TestUSD | `0x758B3eC662A594c1B8741FC36b388298331Ee2A2` |
| trustedSigner | `0xfF4b87b6E9defF684fD97165Ef1203AabDEc2e9D` |
| owner / deployer | `0xEbb41C00bA73bf1Bc86B8167a46156C1FE33fb2F` (3.87 S-CELO left) |

Verified working: dark switch (staging `/api/v2/health` 200, prod 404, prod `/api/games`
still 200 with its 30 vars untouched); full redeem flow (nonce → wallet signature → pass
cookie); revocation; and four negative cases — reused code, wrong-wallet signature,
replayed nonce, bad admin secret — all rejected correctly.

Runbook §1–§7 are complete except distribution.

---

## 1. Next steps

1. **Get a Vercel protection bypass token.** Preview has Standard Protection on
   (confirmed: root 302s to `vercel.com/sso-api`), so testers cannot load the preview
   without it. Dashboard → project `arcadia-celo` → Settings → Deployment Protection →
   Protection Bypass for Automation. CLI cannot do this.
2. **Send each tester** the preview URL, the bypass token, and one code from
   `arcadia-contracts/celo/.env.staging.tester-codes` (5 unused, 1 wallet each, expire
   2026-08-27).
3. **Mint TestUSD for each tester wallet** — mint is open by design:
   ```bash
   cast send 0x758B3eC662A594c1B8741FC36b388298331Ee2A2 "mint(address,uint256)" <wallet> 1000000000000000000000 \
     --rpc-url https://forno.celo-sepolia.celo-testnet.org --private-key <deployer key from .env.staging>
   ```
4. **Run the §6 guard drill once.** Point staging `DATABASE_URL` at the prod string,
   redeploy, confirm it refuses to boot with
   `[bootstrap] FATAL: staging deploy is pointed at the production database`, then
   restore. The guard is configured but has never actually fired.
5. **Push the three local commits** when ready — `0ccf874` (contracts env fix),
   `f7b9aef` (runbook), `080cd7d` (home gitignore). All still local.
6. **Then start the real work:** `ArcadiaPool.sol` and the weekly buy-in / bust / payout
   engine. None of it is written. What shipped here is only the fence around where it goes.

---

## 2. What is broken or needs fixing

### Blocking
- **Nothing blocks the environment.** It is fully functional.

### Needs attention
- **Vercel protection bypass not obtainable via CLI** — the one genuine blocker on
  distributing codes. Dashboard-only.
- **Preview build does not auto-trigger.** `v2` and `main` are the same SHA
  (`4e547ee7`), and Vercel skips builds for a commit that already has a deployment. The
  current preview was forced manually with `vercel deploy --target preview`. Once `v2`
  gets its own commits this resolves itself; until then, any preview refresh must be
  manual.
- **Stale `TRUSTED_SIGNER` in the mainnet `.env`.** It reads `0x0A4Da252…` but the live
  mainnet contract at `0xFb2F048B…` reports `trustedSigner()` = `0x350FA35e…`. Not used
  by staging, but a future mainnet deploy would bake in the wrong signer. Reconcile
  before touching mainnet.
- **`.env.staging.signer` is the only local copy of the staging signer key.** It is
  also in Railway (verified identical), so it is recoverable — but if both are lost the
  contract needs `setTrustedSigner` to recover, which only works while you hold the
  owner key.
- **Local `psql` cannot reach Neon** from this shell (sandbox networking rewrites the
  port to 5435; connections time out). Not a real problem — the app connects fine — but
  direct DB inspection has to happen through the Neon SQL editor.

### Known and accepted (from the runbook)
- Access gate is an in-memory allowlist assuming a single Railway replica. A second
  replica would not see a revocation until redeploy.

---

## 3. What we tried, and what actually went wrong

**Deploy failed with `mainnet: CUSD_ADDRESS, USDC_ADDRESS, USDT_ADDRESS required`.**
Root cause: `forge` auto-loads `.env` from the project root, and **shell variables do not
override it**. Sourcing `.env.staging` produced a hybrid — `MAINNET=1` and the real
USDC/USDT addresses leaked from the mainnet `.env` (neither key existed in
`.env.staging`), while `CUSD_ADDRESS=0x0` came from staging. The mainnet branch ran and
the zero address tripped the require. Fix: set `MAINNET=0` and all three token addresses
*explicitly* in staging so every mainnet key is shadowed. Note it must be `MAINNET=0`,
not `false` — the script parses it as a uint. The runbook said `false` and listed only
`CUSD_ADDRESS`, which is exactly what caused this; both are now corrected.

**Railway CLI silently ignored `--branch v2` on `railway add`.** The flag was swallowed
by the interactive prompt and the service deployed `main`. Caught by inspecting
`railway status --json` (`meta.branch` read `main`). Fixed with
`railway service source connect --repo … --branch v2 --service …` then
`railway redeploy --from-source`. **If you rebuild this service, verify the branch after
creating it — do not trust the flag.**

**`DATABASE_URL` was set with a mangled name.** The Neon string contains `&`, which bash
read as "run in background", truncating the value at `?sslmode` and losing
`channel_binding=require`. The `KEY=` prefix was also missing, so Railway stored a
variable whose *name* was the connection string. The app kept returning
`{"error":"db unavailable"}`. Fixed by piping the value through stdin so the shell never
parses it:
```bash
printf '%s' '<connection-string>' | railway variable set DATABASE_URL --stdin --service arcadia-v2-api
```
Then deleted the malformed entry and redeployed. **Always use `--stdin` for connection
strings.**

**Secrets exposure.** Two separate issues, both closed:
- `arcadia-contracts/.gitignore` covered `.env`, `.env.local`, `.env.*.local` — but not
  `.env.staging`, which holds a live private key. Widened to `.env.*` with
  `!.env.example`.
- `$HOME` is itself a git repo **with a GitHub remote** (`greyw0rks/arcadia-backend`) and
  had no `.gitignore`. `git add -A` there would have staged `.env` files from 28 projects
  across the machine. Added `/home/greyw0rks/.gitignore` covering `.env*`, keys, `.ssh/`,
  `.aws/`, `.config/gh/`, `.railway/`, `.vercel/`. Verified with `git log -S` that
  **nothing ever reached git history** — this was a near miss, not a leak.

---

## 4. Other ways this could be done

**Secrets.** They currently live in gitignored mode-600 files under
`arcadia-contracts/celo/`, duplicated into Railway (verified identical, so Railway is the
durable copy). Alternatives, roughly in order of effort:
- Treat Railway as the only source of truth and delete the local files —
  `railway variables --kv` recovers them. Simplest, no new tooling.
- `git-crypt` or `sops` + age to commit encrypted secrets. Survives machine loss,
  versioned with the code.
- A hosted manager (1Password CLI, Doppler, Infisical) if more than one person ever
  needs these.
- For the signer specifically: a hardware wallet or KMS signer instead of a raw key in
  an env var. Overkill for zero-value TestUSD; the right answer before mainnet.

**Preview build not auto-triggering.** Instead of forcing `vercel deploy`, open a draft
PR from `v2` — the project has `onPullRequest: true`, so a PR builds automatically. Or
just land the first real `v2` commit, which makes the SHAs differ and resolves it
naturally.

**Env-bleed class of bug.** Beyond setting every key explicitly, you could pass
`--env-file .env.staging` if the Foundry version supports it, run deploys from a
directory with no `.env`, or add an assertion in `Deploy.s.sol` that refuses to take the
mainnet branch when `block.chainid` is a testnet. The last is the most durable — it makes
the contract itself reject the mistake rather than relying on env hygiene.

**Isolation.** Separate Railway project + separate Neon project is what the runbook
chose, and it holds. If this grows, Neon branches give cheaper ephemeral per-PR DBs — but
they share the parent's storage, which is exactly the confusion this setup was built to
avoid. Do not switch without a reason.

---

## 5. Secret locations (all gitignored, mode 600, none in git history)

```
arcadia-contracts/celo/.env.staging               deployer key + TRUSTED_SIGNER + MAINNET=0
arcadia-contracts/celo/.env.staging.signer        settlement signer private key
arcadia-contracts/celo/.env.staging.secrets       ADMIN_SECRET + V2_GATE_SECRET
arcadia-contracts/celo/.env.staging.tester-codes  5 unused tester codes
arcadia-contracts/celo/.env                       MAINNET deployer key — do not confuse
```

The Railway CLI is directory-scoped: run staging commands from `/tmp/arcadia-v2-staging`
(linked to the staging project) and prod commands from `arcadia-backend/` (linked to
`celebrated-alignment`). Running from the wrong directory targets the wrong project.
`/tmp` does not survive reboot — re-link with `railway link` if it disappears.
