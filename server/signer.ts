// Signs settlement attestations with the trusted signer key — the ONLY secret the backend holds.
// Uses EIP-712 typed data matching QuizArcade v2's SETTLEMENT_TYPEHASH:
//   "Settlement(bytes32 sessionId,uint256 multiplierBp,address token)"
// The `token` field is included so a signature for USDm cannot be replayed against USDC.

import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { celoChain, ARCADE_ADDRESS, celoTokenMeta, DEFAULT_CELO_TOKEN, type CeloToken } from "../lib/contract";
import { getSignerPrivateKey } from "./config";

let _account: PrivateKeyAccount | null = null;
function account(): PrivateKeyAccount {
  if (!_account) _account = privateKeyToAccount(getSignerPrivateKey());
  return _account;
}

// Single EIP-712 domain for the v2 contract. version "2" must match the contract constructor:
//   EIP712("QuizArcade", "2")
// verifyingContract is ARCADE_ADDRESS (one deployment for all tokens).
const CELO_DOMAIN = {
  name: "QuizArcade",
  version: "2",
  chainId: celoChain.id,
  verifyingContract: ARCADE_ADDRESS,
} as const;

// Must match the v2 SETTLEMENT_TYPEHASH exactly (field order matters for ABI encoding).
const TYPES = {
  Settlement: [
    { name: "sessionId",    type: "bytes32" },
    { name: "multiplierBp", type: "uint256" },
    { name: "token",        type: "address" },
  ],
} as const;

export function signerAddress(): `0x${string}` {
  return account().address;
}

export async function signSettlement(
  sessionId: `0x${string}`,
  multiplierBp: number,
  token?: CeloToken
): Promise<`0x${string}`> {
  const tokenAddress = celoTokenMeta(token ?? DEFAULT_CELO_TOKEN).tokenAddress;
  return account().signTypedData({
    domain:      CELO_DOMAIN,
    types:       TYPES,
    primaryType: "Settlement",
    message: {
      sessionId,
      multiplierBp: BigInt(multiplierBp),
      token:        tokenAddress,
    },
  });
}
