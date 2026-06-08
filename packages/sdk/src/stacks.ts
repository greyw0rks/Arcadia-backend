// @greyw0rks/arcadia/stacks
// Stacks chain utilities: secp256k1 signing, network helpers, contract call builders.

import { STACKS_CONTRACT_MAINNET } from "./types.js";

export { STACKS_CONTRACT_MAINNET };

// ── Network helper ────────────────────────────────────────────────────────────

export type StacksNetworkName = "mainnet" | "testnet";

/**
 * Returns a StacksMainnet or StacksTestnet instance.
 * Requires @stacks/network as a peer dependency.
 */
export async function stacksNetwork(
  network: StacksNetworkName = "mainnet",
  apiUrl?: string
) {
  const { StacksMainnet, StacksTestnet } = await import("@stacks/network");
  return network === "mainnet"
    ? new StacksMainnet({ url: apiUrl ?? "https://api.mainnet.hiro.so" })
    : new StacksTestnet({ url: apiUrl ?? "https://api.testnet.hiro.so" });
}

// ── EIP-like signing for Stacks ───────────────────────────────────────────────

export interface SignStacksSettlementOptions {
  sessionId: string;       // 0x-prefixed 32-byte hex
  multiplierBp: number;
  signerPrivateKey: string; // 64 hex chars, no 0x prefix, no trailing 01
}

/**
 * Sign a Stacks settlement using secp256k1 over the Clarity consensus buffer.
 * Produces a 65-byte RSV signature accepted by quiz-arcade.clar's secp256k1-verify.
 * Requires @stacks/transactions as a peer dependency.
 */
export async function signStacksSettlement({
  sessionId,
  multiplierBp,
  signerPrivateKey,
}: SignStacksSettlementOptions): Promise<string> {
  const {
    serializeCV,
    tupleCV,
    bufferCV,
    uintCV,
    signMessageHashRsv,
    createStacksPrivateKey,
  } = await import("@stacks/transactions");
  const { createHash } = await import("crypto");

  const pk = signerPrivateKey.startsWith("0x")
    ? signerPrivateKey.slice(2)
    : signerPrivateKey;

  if (!/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("signerPrivateKey must be 64 hex chars (no 0x, no trailing 01)");
  }

  const sessionBytes = hexToBytes(sessionId);
  const cv = tupleCV({
    "session-id": bufferCV(sessionBytes),
    "multiplier-bp": uintCV(multiplierBp),
  });

  const serialized = serializeCV(cv);
  const serializedHex =
    typeof serialized === "string"
      ? serialized
      : Buffer.from(serialized).toString("hex");

  const msgHash = createHash("sha256")
    .update(Buffer.from(serializedHex, "hex"))
    .digest("hex");

  const sig = signMessageHashRsv({
    messageHash: msgHash,
    privateKey: createStacksPrivateKey(pk),
  });

  return "0x" + sig.data;
}

// ── Contract call helpers ─────────────────────────────────────────────────────

export interface StacksSessionParams {
  sessionId: string;    // 0x-prefixed hex
  stakeUstx: number;    // micro-STX (1 STX = 1_000_000)
  maxRounds: number;
}

export interface StacksSettleParams {
  sessionId: string;
  multiplierBp: number;
  signature: string;    // 0x-prefixed 65-byte RSV hex
}

/**
 * Build Clarity function args for start-session.
 * Requires @stacks/transactions as a peer dependency.
 */
export async function buildStartSessionArgs({ sessionId, stakeUstx, maxRounds }: StacksSessionParams) {
  const { bufferCV, uintCV } = await import("@stacks/transactions");
  return [
    bufferCV(hexToBytes(sessionId)),
    uintCV(stakeUstx),
    uintCV(maxRounds),
  ];
}

/**
 * Build Clarity function args for settle.
 * Requires @stacks/transactions as a peer dependency.
 */
export async function buildSettleArgs({ sessionId, multiplierBp, signature }: StacksSettleParams) {
  const { bufferCV, uintCV } = await import("@stacks/transactions");
  return [
    bufferCV(hexToBytes(sessionId)),
    uintCV(multiplierBp),
    bufferCV(hexToBytes(signature)),
  ];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
