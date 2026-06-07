# Arcadia Backend — Deployment (Render)

The backend is the **stateful** half of the Arcadia Next.js app: it serves `/api/*`, holds the
**in-memory session store** (answer keys, per-round deadlines, the running multiplier) and the
**trusted-signer keys** that sign settlements for both chains. The public UI (`arcadia-frontend`)
proxies its `/api/*` calls here.

> ⚠️ **Must be always-on.** The session store lives in process memory (`server/sessions.ts`). A
> serverless/sleeping host drops every in-flight game. Use Render's **starter** plan (or any
> always-on Node host), never the free tier.

## Deploy with the blueprint

This folder ships a `render.yaml` (`rootDir: .`, `plan: starter`, health check `/api/games`).

1. Push `arcadia-backend/` as its own Git repo.
2. Render → **New +** → **Blueprint** → point at this repo. It reads `render.yaml`.
3. After the first deploy, set the secret env vars (below) in the Render dashboard.

## Environment variables

Public chain config (same values you'll set on the frontend) is already defaulted in `render.yaml`.
Set these in the dashboard:

| Var | Notes |
|---|---|
| `NEXT_PUBLIC_ARCADE_ADDRESS` | Deployed Celo `QuizArcade` address (`0x…`) |
| `NEXT_PUBLIC_STACKS_ARCADE_CONTRACT` | `<deployer>.quiz-arcade` |
| `NEXT_PUBLIC_WC_PROJECT_ID` | WalletConnect Cloud project id |
| `SETTLEMENT_SIGNER_PRIVATE_KEY` | **SECRET.** Celo signer; its address == `QuizArcade.trustedSigner` |
| `STACKS_SIGNER_PRIVATE_KEY` | **SECRET.** Stacks signer; its compressed pubkey == on-chain `trusted-signer-pubkey` |

> **Do NOT set `BACKEND_URL` here.** That flag is only for the Vercel frontend. Unset, this service
> serves its own `/api` routes with the in-memory store (which is the point of the backend).

Keep the signer keys **separate from the deployer/treasury keys** (HSM / managed secrets in prod).

## After deploy — wire the on-chain signer

The on-chain signer MUST match each key above, or every `settle` reverts
(`BadSignature` / `ERR-BAD-SIGNATURE u108`):

- **Celo:** call `setSigner(<address of SETTLEMENT_SIGNER_PRIVATE_KEY>)` on `QuizArcade.sol`.
- **Stacks:** derive the compressed pubkey (`node scripts/stacks-signer-pubkey.mjs`) and call
  `set-signer-pubkey` on `quiz-arcade.clar`.

## Smoke test

```bash
curl https://<your-render-url>/api/games      # 200 + game list (also the health check path)
```
