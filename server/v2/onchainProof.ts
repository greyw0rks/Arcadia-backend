// server/v2/onchainProof.ts — prove wallet ownership with a transaction instead of a signature.
//
// MiniPay does not support personal_sign or eth_signTypedData (docs/MINIPAY_V2_CONSTRAINTS.md), so
// the original redeem flow — "sign this code+nonce message" — is unsatisfiable there. Since MiniPay
// is most of the target audience, V2 was effectively unreachable for testers.
//
// A transaction is signed by the wallet too, and MiniPay supports transactions. So ownership is
// proven by asking the tester to send one, and checking on-chain that it came `from` the address
// they are claiming.
//
// Why the code never appears in the transaction: calldata is public the moment it hits the mempool.
// If the tester put their invite code on-chain, anyone watching could copy it and redeem first —
// turning the proof into a race the legitimate tester can lose. Instead the backend issues a
// short-lived nonce BOUND TO ONE ADDRESS, and only that nonce goes on-chain. Observing it buys an
// attacker nothing: presenting it from a different address fails, because the check is that the
// transaction's `from` equals the address the nonce was issued to.
//
// The nonce is carried as a self-transfer of 0 with the nonce in calldata. Zero value, so the
// tester risks nothing beyond the fee, which MiniPay pays in stablecoins via fee abstraction.

import { randomBytes } from "crypto";
import { createPublicClient, http, getAddress, type Hash } from "viem";
import { celoChain, RPC_URL } from "../../lib/contract";
import type { ChainId } from "../../lib/contract";

const publicClient = createPublicClient({ chain: celoChain, transport: http(RPC_URL) });

/** How long a proof nonce stays valid. Long enough to open a wallet and confirm; short enough that
 *  an abandoned nonce does not linger. */
const NONCE_TTL_MS = 15 * 60 * 1000;

/** Nonce -> the address it was issued to, plus expiry. Binding to an address is what makes a
 *  mempool-observable nonce worthless to anyone else. */
const proofNonces = new Map<string, { player: string; expiresAt: number }>();

/** Transaction hashes already spent on a proof. Stops one transaction proving two redemptions. */
const usedTxs = new Set<string>();

function norm(a: string): string {
  return a.toLowerCase();
}

/**
 * Issue a proof nonce for a specific wallet. The tester embeds this in a 0-value transaction.
 *
 * Returns the nonce and the calldata to send. The calldata is `0x` + the nonce hex, which any
 * wallet can send — no contract, no ABI, no approval step.
 */
export function issueProofNonce(player: string): { nonce: string; calldata: `0x${string}`; expiresAt: number } {
  // Opportunistic sweep so the map cannot grow unbounded.
  const now = Date.now();
  for (const [n, v] of proofNonces) if (v.expiresAt < now) proofNonces.delete(n);

  const nonce = randomBytes(16).toString("hex");
  const expiresAt = now + NONCE_TTL_MS;
  proofNonces.set(nonce, { player: norm(player), expiresAt });
  return { nonce, calldata: `0x${nonce}`, expiresAt };
}

export type ProofResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Verify that `txHash` is a transaction sent by `player` carrying `nonce` in its calldata.
 *
 * Checks, in order of what they defend against:
 *  - nonce is known, unexpired, and was issued to THIS address  → stops nonce theft
 *  - transaction hash not already used                          → stops replay of one tx
 *  - transaction exists and is confirmed (receipt, status ok)   → stops fabricated hashes
 *  - transaction `from` matches the claimed address             → the actual ownership proof
 *  - calldata contains the nonce                                → binds the tx to this challenge
 *
 * The nonce is consumed on success AND on a confirmed mismatch, so a failed attempt cannot be
 * retried with a different transaction.
 */
export async function verifyProofTx(
  player: string,
  nonce: string,
  txHash: string,
  _chain: ChainId
): Promise<ProofResult> {
  const issued = proofNonces.get(nonce);
  if (!issued) return { ok: false, reason: "proof expired — request a new one" };
  if (issued.expiresAt < Date.now()) {
    proofNonces.delete(nonce);
    return { ok: false, reason: "proof expired — request a new one" };
  }
  // The binding that makes an observable nonce useless to an attacker.
  if (issued.player !== norm(player)) {
    return { ok: false, reason: "this proof was issued to a different wallet" };
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: "malformed transaction hash" };
  }
  if (usedTxs.has(norm(txHash))) {
    return { ok: false, reason: "that transaction has already been used" };
  }

  let tx;
  let receipt;
  try {
    tx = await publicClient.getTransaction({ hash: txHash as Hash });
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hash });
  } catch {
    // Not mined yet, or the hash does not exist. Do NOT consume the nonce — the tester may simply
    // be ahead of the chain, and failing here permanently would be a bad experience.
    return { ok: false, reason: "transaction not found yet — wait for it to confirm and retry" };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "that transaction failed on-chain" };
  }

  // The proof itself: the chain says this address sent it.
  if (!tx.from || getAddress(tx.from) !== getAddress(player)) {
    proofNonces.delete(nonce);
    return { ok: false, reason: "transaction was not sent by this wallet" };
  }

  if (!tx.input || !tx.input.toLowerCase().includes(nonce.toLowerCase())) {
    proofNonces.delete(nonce);
    return { ok: false, reason: "transaction does not carry the expected proof" };
  }

  proofNonces.delete(nonce);
  usedTxs.add(norm(txHash));
  return { ok: true };
}

/** Test-only: clear module state between cases. */
export function _resetForTests(): void {
  proofNonces.clear();
  usedTxs.clear();
}

/** Test-only: seed a nonce without going through issueProofNonce. */
export function _seedNonceForTests(nonce: string, player: string, ttlMs = NONCE_TTL_MS): void {
  proofNonces.set(nonce, { player: norm(player), expiresAt: Date.now() + ttlMs });
}
