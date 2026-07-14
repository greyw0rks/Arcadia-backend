import { describe, it, expect, beforeAll } from "vitest";
import { recoverTypedDataAddress } from "viem";

// QuizArcade v2 signing tests.
//
// v2 uses a SINGLE contract for all tokens. Cross-token replay is prevented by including the
// token address in the signed message (not by varying verifyingContract). This test:
//   1. Verifies the signature recovers the signer against the correct domain + message.
//   2. Verifies a signature for USDm does NOT validate a USDm settlement replayed against USDC
//      (different `token` in message → different digest → different recovered address).

const ARCADE_ADDRESS = "0x1111111111111111111111111111111111111111";
const TOKEN_CUSD  = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const TOKEN_USDC  = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const TOKEN_USDT  = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

// Well-known test private key (Hardhat account #1 — not a real key).
const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const TYPES = {
  Settlement: [
    { name: "sessionId",    type: "bytes32" },
    { name: "multiplierBp", type: "uint256" },
    { name: "token",        type: "address" },
  ],
} as const;

let signSettlement: typeof import("./signer").signSettlement;
let signerAddress:  typeof import("./signer").signerAddress;
let celoChain:      typeof import("../lib/contract").celoChain;

beforeAll(async () => {
  process.env.SETTLEMENT_SIGNER_PRIVATE_KEY = TEST_PK;
  process.env.NEXT_PUBLIC_CELO_NETWORK      = "mainnet";
  process.env.NEXT_PUBLIC_ARCADE_ADDRESS    = ARCADE_ADDRESS;
  // Import AFTER env is set — module-level constants are evaluated at load time.
  const contract = await import("../lib/contract");
  celoChain = contract.celoChain;
  const signer = await import("./signer");
  signSettlement = signer.signSettlement;
  signerAddress  = signer.signerAddress;
});

function domain(arcadeAddress: `0x${string}`) {
  return {
    name: "QuizArcade",
    version: "2",
    chainId: celoChain.id,
    verifyingContract: arcadeAddress,
  } as const;
}

describe("QuizArcade v2 signing", () => {
  const sessionId    = `0x${"ab".repeat(32)}` as `0x${string}`;
  const multiplierBp = 14000;

  it("single ARCADE_ADDRESS is the verifyingContract for all tokens", () => {
    expect(celoChain.id).toBe(42220);
    // Env is set above; module was imported after.
    expect(process.env.NEXT_PUBLIC_ARCADE_ADDRESS!.toLowerCase()).toBe(ARCADE_ADDRESS.toLowerCase());
  });

  it("signature recovers the signer against the correct domain + message", async () => {
    const signature = await signSettlement(sessionId, multiplierBp, "cusd");
    const recovered = await recoverTypedDataAddress({
      domain: domain(ARCADE_ADDRESS as `0x${string}`),
      types: TYPES,
      primaryType: "Settlement",
      message: { sessionId, multiplierBp: BigInt(multiplierBp), token: TOKEN_CUSD },
      signature,
    });
    expect(recovered.toLowerCase()).toBe(signerAddress().toLowerCase());
  });

  it("cross-token replay is rejected: USDm signature does not validate for USDC message", async () => {
    const signature = await signSettlement(sessionId, multiplierBp, "cusd");
    // Try to verify the USDm signature against a USDC message (same contract, different token address).
    const recovered = await recoverTypedDataAddress({
      domain: domain(ARCADE_ADDRESS as `0x${string}`),
      types: TYPES,
      primaryType: "Settlement",
      message: { sessionId, multiplierBp: BigInt(multiplierBp), token: TOKEN_USDC },
      signature,
    });
    expect(recovered.toLowerCase()).not.toBe(signerAddress().toLowerCase());
  });

  it("cross-token replay is rejected: USDC signature does not validate for USDT message", async () => {
    const signature = await signSettlement(sessionId, multiplierBp, "usdc");
    const recovered = await recoverTypedDataAddress({
      domain: domain(ARCADE_ADDRESS as `0x${string}`),
      types: TYPES,
      primaryType: "Settlement",
      message: { sessionId, multiplierBp: BigInt(multiplierBp), token: TOKEN_USDT },
      signature,
    });
    expect(recovered.toLowerCase()).not.toBe(signerAddress().toLowerCase());
  });

  it("defaults to USDm token when no token is passed", async () => {
    const signature = await signSettlement(sessionId, multiplierBp);
    const recovered = await recoverTypedDataAddress({
      domain: domain(ARCADE_ADDRESS as `0x${string}`),
      types: TYPES,
      primaryType: "Settlement",
      message: { sessionId, multiplierBp: BigInt(multiplierBp), token: TOKEN_CUSD },
      signature,
    });
    expect(recovered.toLowerCase()).toBe(signerAddress().toLowerCase());
  });
});
