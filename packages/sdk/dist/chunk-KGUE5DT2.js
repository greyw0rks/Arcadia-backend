// src/stacks.ts
async function stacksNetwork(network = "mainnet", apiUrl) {
  const { StacksMainnet, StacksTestnet } = await import("@stacks/network");
  return network === "mainnet" ? new StacksMainnet({ url: apiUrl ?? "https://api.mainnet.hiro.so" }) : new StacksTestnet({ url: apiUrl ?? "https://api.testnet.hiro.so" });
}
async function signStacksSettlement({
  sessionId,
  multiplierBp,
  signerPrivateKey
}) {
  const {
    serializeCV,
    tupleCV,
    bufferCV,
    uintCV,
    signMessageHashRsv,
    createStacksPrivateKey
  } = await import("@stacks/transactions");
  const { createHash } = await import("crypto");
  const pk = signerPrivateKey.startsWith("0x") ? signerPrivateKey.slice(2) : signerPrivateKey;
  if (!/^[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("signerPrivateKey must be 64 hex chars (no 0x, no trailing 01)");
  }
  const sessionBytes = hexToBytes(sessionId);
  const cv = tupleCV({
    "session-id": bufferCV(sessionBytes),
    "multiplier-bp": uintCV(multiplierBp)
  });
  const serialized = serializeCV(cv);
  const serializedHex = typeof serialized === "string" ? serialized : Buffer.from(serialized).toString("hex");
  const msgHash = createHash("sha256").update(Buffer.from(serializedHex, "hex")).digest("hex");
  const sig = signMessageHashRsv({
    messageHash: msgHash,
    privateKey: createStacksPrivateKey(pk)
  });
  return "0x" + sig.data;
}
async function buildStartSessionArgs({ sessionId, stakeUstx, maxRounds }) {
  const { bufferCV, uintCV } = await import("@stacks/transactions");
  return [
    bufferCV(hexToBytes(sessionId)),
    uintCV(stakeUstx),
    uintCV(maxRounds)
  ];
}
async function buildSettleArgs({ sessionId, multiplierBp, signature }) {
  const { bufferCV, uintCV } = await import("@stacks/transactions");
  return [
    bufferCV(hexToBytes(sessionId)),
    uintCV(multiplierBp),
    bufferCV(hexToBytes(signature))
  ];
}
function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export {
  stacksNetwork,
  signStacksSettlement,
  buildStartSessionArgs,
  buildSettleArgs
};
