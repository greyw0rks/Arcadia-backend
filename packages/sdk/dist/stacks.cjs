"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/stacks.ts
var stacks_exports = {};
__export(stacks_exports, {
  STACKS_CONTRACT_MAINNET: () => STACKS_CONTRACT_MAINNET,
  buildSettleArgs: () => buildSettleArgs,
  buildStartSessionArgs: () => buildStartSessionArgs,
  signStacksSettlement: () => signStacksSettlement,
  stacksNetwork: () => stacksNetwork
});
module.exports = __toCommonJS(stacks_exports);

// src/types.ts
var import_viem = require("viem");
var STACKS_CONTRACT_MAINNET = {
  address: "SP1SY1E599GN04XRD2DQBKV7E62HYBJR2CT9S5QKK",
  name: "quiz-arcade",
  trustedSignerPubkey: "0x024563149f07fdcdffb5bed5dc367c690ea7ee6491f7ed5edcbcbcb3b6354ead62"
};
var celoMainnet = (0, import_viem.defineChain)({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo.org"] },
    public: { http: ["https://forno.celo.org"] }
  },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://celoscan.io" }
  }
});

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  STACKS_CONTRACT_MAINNET,
  buildSettleArgs,
  buildStartSessionArgs,
  signStacksSettlement,
  stacksNetwork
});
