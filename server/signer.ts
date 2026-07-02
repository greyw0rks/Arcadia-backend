// Signs settlement attestations with the trusted signer key — the ONLY secret the backend holds.
// The signature is what the on-chain settle() verifies, so each chain's scheme must match its contract:
//   - celo:   EIP-712 typed data over EIP712("QuizArcade","1") + chainId + verifyingContract.
//   - stacks: a 65-byte RSV secp256k1 signature over sha256(to-consensus-buff?({session-id, multiplier-bp})).

import { createHash } from "crypto";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
  serializeCV,
  tupleCV,
  bufferCV,
  uintCV,
  signMessageHashRsv,
  createStacksPrivateKey,
} from "@stacks/transactions";
import {
  celoChain,
  baseChain,
  CELO_TOKENS,
  BASE_TOKENS,
  DEFAULT_CELO_TOKEN,
  type CeloToken,
} from "../lib/contract";
import { getSignerPrivateKey, getStacksSignerPrivateKey } from "./config";
import type { ChainId } from "./sessions";

// ---- Celo (EIP-712) ----

// Lazily created so `next build` (which imports route modules to collect metadata) doesn't require
// the secret to be present. The account is built on the first signing request at runtime.
let _account: PrivateKeyAccount | null = null;
function account(): PrivateKeyAccount {
  if (!_account) _account = privateKeyToAccount(getSignerPrivateKey());
  return _account;
}

// The EIP-712 domain is built PER-CALL: the verifyingContract differs per stake token because each
// token has its own QuizArcade instance (see CELO_TOKENS). Signing for the wrong instance makes that
// instance's settle() revert BadSignature. chainId must match the deployed network.
function celoDomain(token: CeloToken) {
  return {
    name: "QuizArcade",
    version: "1",
    chainId: celoChain.id,
    verifyingContract: CELO_TOKENS[token].arcadeAddress,
  } as const;
}

function baseDomain() {
  return {
    name: "QuizArcade",
    version: "1",
    chainId: baseChain.id,
    verifyingContract: BASE_TOKENS.usdc.arcadeAddress,
  } as const;
}

const types = {
  Settlement: [
    { name: "sessionId", type: "bytes32" },
    { name: "multiplierBp", type: "uint256" },
  ],
} as const;

export function signerAddress(): `0x${string}` {
  return account().address;
}

async function signEvmSettlement(
  sessionId: `0x${string}`,
  multiplierBp: number,
  domain: ReturnType<typeof celoDomain> | ReturnType<typeof baseDomain>
): Promise<`0x${string}`> {
  return account().signTypedData({
    domain,
    types,
    primaryType: "Settlement",
    message: { sessionId, multiplierBp: BigInt(multiplierBp) },
  });
}

// ---- Stacks (secp256k1 over the Clarity consensus buffer) ----

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function signStacksSettlement(
  sessionId: `0x${string}`,
  multiplierBp: number
): Promise<`0x${string}`> {
  // Reproduce the contract's hash: sha256(to-consensus-buff?({session-id, multiplier-bp})).
  // serializeCV emits the exact SIP-005 consensus bytes that to-consensus-buff? produces.
  const cv = tupleCV({
    "session-id": bufferCV(hexToBytes(sessionId)),
    "multiplier-bp": uintCV(multiplierBp),
  });
  const serialized = serializeCV(cv); // hex string in @stacks/transactions v6
  const serializedHex = typeof serialized === "string" ? serialized : Buffer.from(serialized).toString("hex");
  const msgHash = createHash("sha256").update(Buffer.from(serializedHex, "hex")).digest("hex");

  const sig = signMessageHashRsv({
    messageHash: msgHash,
    privateKey: createStacksPrivateKey(getStacksSignerPrivateKey()),
  });
  // .data is 65-byte RSV hex; the contract's secp256k1-verify accepts a (buff 65).
  return ("0x" + sig.data) as `0x${string}`;
}

// ---- Dispatch ----

export async function signSettlement(
  chain: ChainId,
  sessionId: `0x${string}`,
  multiplierBp: number,
  token?: CeloToken
): Promise<`0x${string}`> {
  switch (chain) {
    case "stacks":
      return signStacksSettlement(sessionId, multiplierBp);
    case "base":
      return signEvmSettlement(sessionId, multiplierBp, baseDomain());
    case "celo":
    default:
      return signEvmSettlement(
        sessionId,
        multiplierBp,
        celoDomain(token ?? DEFAULT_CELO_TOKEN)
      );
  }
}
