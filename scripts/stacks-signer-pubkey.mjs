// Prints the 33-byte compressed secp256k1 public key for the Stacks settlement signer.
// Set this on the deployed contract via `set-signer-pubkey` (see DEPLOYMENT.md).
//   STACKS_SIGNER_PRIVATE_KEY=<64-hex> node scripts/stacks-signer-pubkey.mjs
import { getPublicKey } from "@noble/secp256k1";

const pk = process.env.STACKS_SIGNER_PRIVATE_KEY;
if (!pk || !/^(0x)?[0-9a-fA-F]{64}$/.test(pk)) {
  throw new Error("STACKS_SIGNER_PRIVATE_KEY missing or malformed (expect 64 hex chars).");
}
const clean = pk.startsWith("0x") ? pk.slice(2) : pk;
const pub = getPublicKey(clean, true); // compressed
const hex = Buffer.from(pub).toString("hex");
process.stdout.write("0x" + hex + "\n");
