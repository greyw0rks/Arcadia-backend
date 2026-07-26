// server/accessGate.ts — private-tester allowlist for the V2 economy.
//
// Same shape as blacklist.ts (Postgres-backed, hydrated into an in-memory Set on boot, synchronous
// check on the hot path) with the one crucial inversion: this FAILS CLOSED. blacklist.ts falls open
// on no-DB because it is a deny-list — the safe default is "nobody banned". An allow-list's safe
// default is "nobody in": if hydration hasn't happened, or the DB is down, no wallet has V2 access.
//
// The other inversion is trust in the address itself. Session routes read `player` from the JSON
// body, which is fine for a deny-list (nobody spoofs INTO a ban) and useless for an allow-list
// (anyone can send a tester's address). hasV2Access() must therefore only ever be called with an
// address proven by signature — see app/api/v2/access/redeem and app/api/v2/_gate.ts.

import { query } from "./db";
import type { ChainId } from "../lib/contract";

function addr(a: string): string {
  return a.startsWith("0x") ? a.toLowerCase() : a;
}
function key(player: string, chain: ChainId): string {
  return `${chain}:${addr(player)}`;
}

// In-memory mirror of active (non-revoked) redemptions. Hydrated on boot; updated on writes.
const ALLOWED = new Set<string>();
let hydrated = false;

/** Load active redemptions from DB into memory. Called from ensureBooted() after initV2Schema(). */
export async function hydrateAccessGate(): Promise<void> {
  if (hydrated) return;
  const res = await query<{ address: string; chain: string }>(
    `SELECT r.address, r.chain
       FROM code_redemptions r
       JOIN access_codes c ON c.code = r.code
      WHERE NOT r.revoked AND NOT c.revoked`
  );
  if (res) {
    for (const row of res.rows) ALLOWED.add(`${row.chain}:${row.address.toLowerCase()}`);
    console.log(`[accessGate] loaded ${res.rowCount} tester wallets`);
    hydrated = true; // only mark hydrated on a successful read — no DB means the gate stays shut
  }
}

/** Synchronous check for the hot path. Fails CLOSED: not hydrated → nobody has access. */
export function hasV2Access(player: string, chain: ChainId): boolean {
  if (!hydrated) return false;
  return ALLOWED.has(key(player, chain));
}

/**
 * Redeem an access code for a wallet. The caller MUST have verified the wallet signature first —
 * this function trusts the address it is given.
 *
 * Atomic: the conditional UPDATE consumes a use only if the code is live (not revoked, under
 * max_uses, not expired); zero rows back means the code is no good. The redemption INSERT then
 * conflicts if the wallet already holds a code.
 */
export async function redeemCode(
  code: string,
  player: string,
  chain: ChainId
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const consumed = await query<{ code: string }>(
    `UPDATE access_codes
        SET uses = uses + 1
      WHERE code = $1 AND NOT revoked AND uses < max_uses
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING code`,
    [code]
  );
  if (!consumed) return { ok: false, reason: "service unavailable" }; // DB down — fail closed
  if (consumed.rowCount === 0) return { ok: false, reason: "invalid or exhausted code" };

  const inserted = await query(
    `INSERT INTO code_redemptions (address, code, chain)
     VALUES ($1, $2, $3)
     ON CONFLICT (address) DO NOTHING
     RETURNING address`,
    [addr(player), code, chain]
  );
  if (!inserted || inserted.rowCount === 0) {
    // Wallet already holds a code (or DB dropped mid-flight). Hand the consumed use back.
    await query(`UPDATE access_codes SET uses = GREATEST(uses - 1, 0) WHERE code = $1`, [code]);
    return { ok: false, reason: inserted ? "wallet already has access" : "service unavailable" };
  }

  ALLOWED.add(key(player, chain));
  return { ok: true };
}

/** Revoke a tester wallet. Clears the in-memory Set too — a DB-only revoke would keep the wallet
 *  live until the next deploy. */
export async function revokeTester(player: string, chain: ChainId): Promise<void> {
  ALLOWED.delete(key(player, chain));
  await query(`UPDATE code_redemptions SET revoked = TRUE WHERE address = $1 AND chain = $2`, [
    addr(player),
    chain,
  ]);
}

/** Revoke a code and every wallet bound to it. */
export async function revokeCode(code: string): Promise<void> {
  await query(`UPDATE access_codes SET revoked = TRUE WHERE code = $1`, [code]);
  const bound = await query<{ address: string; chain: string }>(
    `UPDATE code_redemptions SET revoked = TRUE WHERE code = $1 RETURNING address, chain`,
    [code]
  );
  if (bound) {
    for (const row of bound.rows) ALLOWED.delete(`${row.chain}:${row.address.toLowerCase()}`);
  }
}

/** Test-only: reset module state between vitest cases. */
export function _resetForTests(): void {
  ALLOWED.clear();
  hydrated = false;
}

/** Test-only: force-hydrate without a DB so hot-path logic can be exercised. */
export function _hydrateForTests(entries: Array<{ player: string; chain: ChainId }>): void {
  for (const e of entries) ALLOWED.add(key(e.player, e.chain));
  hydrated = true;
}
