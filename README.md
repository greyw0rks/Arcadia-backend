# Arcadia — Backend

The **stateful API + trusted signer** for Arcadia. This is the Next.js app deployed to **Render**
(always-on). It serves `/api/*`, holds the **in-memory session store** (`server/sessions.ts`) and the
**settlement signer keys**, and signs the final multiplier each chain's `settle` verifies
(`server/signer.ts`: EIP-712 for Celo, secp256k1-over-consensus-buff for Stacks).

> Same Next.js codebase as `arcadia-frontend`, deployed with `BACKEND_URL` **unset** so it serves its
> own `/api` routes. **Must be always-on** — the session store is in process memory and a sleeping
> host drops every in-flight game.

## Run locally

```bash
npm install
cp .env.example .env.local      # fill in NEXT_PUBLIC_* + the SECRET signer keys
npm run build && npm start      # serves /api with the in-memory store
```

## Deploy

See **[DEPLOY_BACKEND.md](./DEPLOY_BACKEND.md)** and `render.yaml`.

## Related folders (siblings)

- `arcadia-frontend/` — public UI (Vercel), proxies `/api/*` here.
- `arcadia-stresstest/` — two-chain load tester.
- `arcadia-contracts/` — Celo (`celo/`) + Stacks (`stacks/`) contract source.
