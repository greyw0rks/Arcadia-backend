// server/v2/pass.ts — signed tester passes for the V2 gate.
//
// The gate cannot trust a body-supplied address (see accessGate.ts), so proving wallet ownership
// happens once, at redeem/login time, via a signature over a server-issued nonce. What the wallet
// gets back is a pass: `base64url(address.chain.exp).hmac`, keyed by V2_GATE_SECRET and set as an
// httpOnly cookie. Every V2 route then verifies the pass — one HMAC, no DB hit, no signature
// ceremony per request.
//
// Passes are bearer tokens with a 7-day expiry. Revocation still bites immediately: _gate.ts checks
// hasV2Access() after verifying the pass, so a revoked wallet fails even with a valid cookie.

import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import type { ChainId } from "../../lib/contract";

const PASS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const PASS_COOKIE = "arcadia_v2_pass";

function secret(): string | null {
  return process.env.V2_GATE_SECRET ?? null;
}

function hmac(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Mint a pass for a wallet whose signature has just been verified. Null if the deploy has no
 *  gate secret — fail closed, nobody gets a pass. */
export function mintPass(player: string, chain: ChainId): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(
    `${player.toLowerCase()}.${chain}.${Date.now() + PASS_TTL_MS}`
  ).toString("base64url");
  return `${payload}.${hmac(payload, key)}`;
}

/** Verify a pass and return the wallet it belongs to, or null. */
export function verifyPass(pass: string): { player: string; chain: ChainId } | null {
  const key = secret();
  if (!key) return null;
  const dot = pass.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = pass.slice(0, dot);
  const mac = pass.slice(dot + 1);
  const expected = hmac(payload, key);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const decoded = Buffer.from(payload, "base64url").toString();
  const [player, chain, expStr] = decoded.split(".");
  const exp = Number(expStr);
  if (!player?.startsWith("0x") || !chain || !Number.isFinite(exp)) return null;
  if (Date.now() > exp) return null;
  return { player, chain: chain as ChainId };
}

// ---------------------------------------------------------------------------
// Redeem nonces — one-time challenges the wallet signs to prove ownership.
// In-memory with a short TTL: staging runs a single always-on process (same
// assumption the session store already makes), and a lost nonce just means
// the tester clicks "sign" again.
// ---------------------------------------------------------------------------

const NONCE_TTL_MS = 5 * 60 * 1000;
const nonces = new Map<string, number>(); // nonce -> expiry

export function issueNonce(): string {
  // Opportunistic sweep so the map can't grow unbounded.
  const now = Date.now();
  for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);

  const nonce = randomBytes(16).toString("hex");
  nonces.set(nonce, now + NONCE_TTL_MS);
  return nonce;
}

/** Consume a nonce. One shot: valid exactly once, then gone. */
export function consumeNonce(nonce: string): boolean {
  const exp = nonces.get(nonce);
  nonces.delete(nonce);
  return exp !== undefined && exp > Date.now();
}

/** The exact message the wallet signs. Human-readable so wallets render something sensible. */
export function redeemMessage(code: string, nonce: string): string {
  return `Arcadia V2 tester access\n\nCode: ${code}\nNonce: ${nonce}`;
}
