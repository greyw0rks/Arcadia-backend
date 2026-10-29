# Issue #8 security review

Reviewed on 2026-10-29 from a fresh, full-history clone of GitHub `main` at
`608601f` ([AskBots feedback](https://github.com/greyw0rks/Arcadia-backend/issues/8)).
The separate local development checkout was not used for these changes.

## Dependency audit

| Scope | Before | After |
| --- | --- | --- |
| Production | 1 critical, 23 high, 16 moderate, 2 low | 0 critical, 13 high, 8 moderate, 0 low |
| Including development tools | 3 critical, 25 high, 19 moderate, 2 low | 0 critical, 13 high, 8 moderate, 2 low |

These are npm's affected-package counts, including transitive propagation; they
are not counts of independently exploitable application flaws. The remaining
production results are saved in [npm-audit-production.json](security/npm-audit-production.json).
Re-run the audit as advisories change:

```bash
npm ci
npm audit --omit=dev
npm audit
```

### Updates

- Next.js 16.2.7 → 16.4.3, viem 2.52.0 → 2.57.13, with patched compatible
  transitive packages resolved into the npm lockfile.
- Vitest 2.1.9 → 5.0.5 and Vite 8.3.5 remove the old test server and worker
  dependency advisories. Development and CI now require Node.js 22.12+ and use
  Node 22 types. The separately published SDK retains its existing runtime range.
- A scoped override updates Wagmi's pinned WalletConnect Ethereum provider
  2.21.1 → 2.26.0. Its updated dependency tree removes old viem, WebSocket and
  URI-decoding dependencies while keeping RainbowKit's supported Wagmi 2 API.
- RainbowKit's pinned `@vanilla-extract/css` updates to 1.21.3, which removes
  the vulnerable `deepmerge` dependency.
- Coinbase CDP stays at the original lockfile's 1.51.0 release, with its pinned
  Axios updated to 1.21.x. Newer CDP 1.60.0 imports optional x402 packages that
  break this application's Next.js build. The SDK build's esbuild updates
  to 0.27.7; its remaining low-severity development-server advisory is listed below.

The overrides are scoped to their parent packages. Remove each when that parent
ships a compatible fixed dependency range. No `--force` or `--legacy-peer-deps`
install is required.

### Unresolved findings

The production audit is **not clean**. All 13 remaining high entries propagate
from [Zod collection-validation memory exhaustion (GHSA-mrhx-c7xc-m3w5)](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Reown AppKit Wallet 1.8.19 requires Zod 3.22.4; even its current 1.8.24 release
still pins that version. Coinbase CDP also requires Zod 3. Its current 1.60.0
release still uses `^3.25.76`. The advisory's patched version is Zod 4.6.6.
Forcing Zod 4 under consumers written for Zod 3 is not a verified fix.

The 8 moderate entries propagate from
[uuid buffer bounds checks (GHSA-w5hq-g745-h8pq)](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
in the MetaMask/Gemini connector dependency tree. npm suggests upgrading Wagmi
to 3.7.9, but RainbowKit 2.2.11 requires `wagmi: ^2.9.0`. That combination needs
a separate wallet integration migration or compatible upstream releases.

The full audit additionally reports 2 low entries for `esbuild`/`tsup`:
[GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
The SDK uses esbuild through `tsup` for bundling, not to expose its development
server; this is not a production dependency. This usage distinction does not
remove the advisory.

The current CI audit displays every production finding and fails on **critical**
severity. High/moderate findings are not suppressed or allowlisted. This threshold
is an interim limit, not a claim that those vulnerabilities are acceptable or
fixed. Raise it to `--audit-level=high` once compatible wallet fixes are available.

## Secret scan

Gitleaks 8.30.1 scanned all 102 commits reachable from the fetched refs, including
history outside `main`. The default rules found 16 entries. Each was inspected:

- 3 Celo token-address constants in `server/signer.test.ts`.
- 12 copies of the same Celo token addresses in SDK source and historical build output.
- 1 public Base USDC token address in a historical `.env.example`.

No private credential was identified in those findings. `.gitleaks.toml` retains
the default rules and excludes only those four exact public token addresses from
the generic API-key detector. It also adds detection for raw EVM private-key
assignments, with exceptions for the invalid all-zero placeholder and the public
Hardhat account #1 fixture used in signing tests. Do not fund that test account.
No entire file, directory, commit or class of hexadecimal strings is excluded.

The configured full-history scan reports zero findings. Synthetic checks confirm
that a new EVM private key and an unrelated API key still fail the scan, while
the documented public token address and zero placeholder pass.

```bash
# Install the official Gitleaks 8.30.1 binary first.
npm run scan:secrets
# Include staged changes before committing:
gitleaks git --pre-commit --staged --redact
```

CI fetches full history and downloads Gitleaks with a pinned SHA-256 checksum.
The expanded `.gitignore` keeps environment variants such as `.env.production`
out of future commits while permitting example templates. No Git history was
rewritten. A clean scanner result is limited to its detection rules and fetched
history; it does not inspect deployment secret stores.

## Validation

- `npm ci` completed with install scripts enabled. Local cache/filesystem corruption
  required a fresh temporary cache and restoration of damaged dependency files from
  the exact registry archives, verified against the lockfile's integrity hashes.
  No dependency source patches or integrity-check bypasses were used.
- `npm test`: 7 test files, 68 tests passed on Vitest 5.0.5.
- `npx tsc --noEmit` and `npm run sdk:build` passed.
- `npm run build` passed, including TypeScript and all 20 static pages, with the
  database, backend proxy, settlement signer and Telegram secrets unset.
- The built server started on a local port without secrets. An HTTP check completed
  all 12 demo questions, checked that questions omit the answer key, and verified
  rejection of demo settlement, repeat demos and invalid wallet addresses.
- Headless Chromium loaded `/games`, dismissed the existing first-visit tutorial,
  opened RainbowKit's wallet chooser and confirmed WalletConnect remained listed,
  with no page errors. External requests were blocked; authenticated wallet pairing
  and on-chain settlement were not exercised.
- Full-history and staged-diff Gitleaks scans passed. Scanner fixtures also checked
  that new private/API keys are still detected.

These checks were run locally before publication. See the associated pull request
for GitHub Actions and deployment status. The unresolved dependency findings above
still need follow-up.
