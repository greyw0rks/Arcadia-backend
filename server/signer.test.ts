import { describe, it, expect, beforeAll } from "vitest";
import { recoverTypedDataAddress } from "viem";

// SECURITY: each Celo stake token has its OWN QuizArcade instance, so the EIP-712 domain's
// verifyingContract differs per token. The backend must sign a settlement against the right
// instance's domain, or that instance's settle() reverts BadSignature. This test recovers the signer
// from a signed Settlement against each token's domain and asserts the signature is valid ONLY for
// the intended contract (binding to verifyingContract), never for a sibling token's contract.

// Distinct, deterministic addresses so a mix-up is detectable.
const ARCADE_CUSD = "0x1111111111111111111111111111111111111111";
const ARCADE_USDC = "0x2222222222222222222222222222222222222222";
const ARCADE_USDT = "0x3333333333333333333333333333333333333333";
// Well-known test private key (not a real key).
const TEST_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const types = {
  Settlement: [
    { name: "sessionId", type: "bytes32" },
    { name: "multiplierBp", type: "uint256" },
  ],
} as const;

let signSettlement: typeof import("./signer").signSettlement;
let signerAddress: typeof import("./signer").signerAddress;
let CELO_TOKENS: typeof import("../lib/contract").CELO_TOKENS;
let celoChain: typeof import("../lib/contract").celoChain;

beforeAll(async () => {
  process.env.SETTLEMENT_SIGNER_PRIVATE_KEY = TEST_PK;
  process.env.NEXT_PUBLIC_CELO_NETWORK = "mainnet";
  process.env.NEXT_PUBLIC_ARCADE_ADDRESS = ARCADE_CUSD;
  process.env.NEXT_PUBLIC_ARCADE_ADDRESS_USDC = ARCADE_USDC;
  process.env.NEXT_PUBLIC_ARCADE_ADDRESS_USDT = ARCADE_USDT;
  // Import AFTER env is set — the registry + signer read these at module load.
  const contract = await import("../lib/contract");
  CELO_TOKENS = contract.CELO_TOKENS;
  celoChain = contract.celoChain;
  const signer = await import("./signer");
  signSettlement = signer.signSettlement;
  signerAddress = signer.signerAddress;
});

function domainFor(arcadeAddress: `0x${string}`) {
  return {
    name: "QuizArcade",
    version: "1",
    chainId: celoChain.id,
    verifyingContract: arcadeAddress,
  } as const;
}

describe("signEvmSettlement per-token verifyingContract", () => {
  const sessionId = `0x${"ab".repeat(32)}` as `0x${string}`;
  const multiplierBp = 14000;
  const message = { sessionId, multiplierBp: BigInt(multiplierBp) };

  const tokens = ["cusd", "usdc", "usdt"] as const;

  it("uses the registry addresses we configured (distinct per token)", () => {
    expect(CELO_TOKENS.cusd.arcadeAddress.toLowerCase()).toBe(ARCADE_CUSD);
    expect(CELO_TOKENS.usdc.arcadeAddress.toLowerCase()).toBe(ARCADE_USDC);
    expect(CELO_TOKENS.usdt.arcadeAddress.toLowerCase()).toBe(ARCADE_USDT);
    expect(celoChain.id).toBe(42220);
  });

  it("each token's signature recovers the signer ONLY against its own verifyingContract", async () => {
    for (const token of tokens) {
      const signature = await signSettlement("celo", sessionId, multiplierBp, token);
      const ownAddr = CELO_TOKENS[token].arcadeAddress;

      // Valid against the intended instance's domain.
      const recovered = await recoverTypedDataAddress({
        domain: domainFor(ownAddr),
        types,
        primaryType: "Settlement",
        message,
        signature,
      });
      expect(recovered.toLowerCase()).toBe(signerAddress().toLowerCase());

      // NOT valid against any sibling token's domain (different verifyingContract).
      for (const other of tokens) {
        if (other === token) continue;
        const recoveredOther = await recoverTypedDataAddress({
          domain: domainFor(CELO_TOKENS[other].arcadeAddress),
          types,
          primaryType: "Settlement",
          message,
          signature,
        });
        expect(recoveredOther.toLowerCase()).not.toBe(signerAddress().toLowerCase());
      }
    }
  });

  it("defaults to the cUSD instance when no token is passed (back-compat)", async () => {
    const signature = await signSettlement("celo", sessionId, multiplierBp);
    const recovered = await recoverTypedDataAddress({
      domain: domainFor(CELO_TOKENS.cusd.arcadeAddress),
      types,
      primaryType: "Settlement",
      message,
      signature,
    });
    expect(recovered.toLowerCase()).toBe(signerAddress().toLowerCase());
  });
});
