// Signs a QuizArcade settlement with the backend signer key — same EIP-712 domain as server/signer.ts.
//   node scripts/sign-settlement.mjs <sessionId> <multiplierBp> <arcadeAddress> <chainId>
import { privateKeyToAccount } from "viem/accounts";

const [, , sessionId, multiplierBp, arcade, chainId] = process.argv;
const pk = process.env.SETTLEMENT_SIGNER_PRIVATE_KEY;
if (!pk) throw new Error("SETTLEMENT_SIGNER_PRIVATE_KEY not set");

const account = privateKeyToAccount(pk);
const sig = await account.signTypedData({
  domain: {
    name: "QuizArcade",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: arcade,
  },
  types: {
    Settlement: [
      { name: "sessionId", type: "bytes32" },
      { name: "multiplierBp", type: "uint256" },
    ],
  },
  primaryType: "Settlement",
  message: { sessionId, multiplierBp: BigInt(multiplierBp) },
});
process.stdout.write(sig);
