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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ARCADE_ABI: () => ARCADE_ABI,
  BPS: () => BPS,
  CELO_TOKENS_MAINNET: () => CELO_TOKENS_MAINNET,
  DEFAULT_CELO_TOKEN: () => DEFAULT_CELO_TOKEN,
  ERC20_ABI: () => ERC20_ABI,
  STACKS_CONTRACT_MAINNET: () => STACKS_CONTRACT_MAINNET,
  STEP_BPS: () => STEP_BPS,
  buildSettleArgs: () => buildSettleArgs,
  buildStartSessionArgs: () => buildStartSessionArgs,
  celoMainnet: () => celoMainnet,
  celoTokenMeta: () => celoTokenMeta,
  clampMultiplierBp: () => clampMultiplierBp,
  computePayout: () => computePayout,
  createArcadeClient: () => createArcadeClient,
  createArcadeReader: () => createArcadeReader,
  createCeloClient: () => createCeloClient,
  maxMultiplierBp: () => maxMultiplierBp,
  parseStake: () => parseStake,
  signEvmSettlement: () => signEvmSettlement,
  signStacksSettlement: () => signStacksSettlement,
  stacksNetwork: () => stacksNetwork
});
module.exports = __toCommonJS(index_exports);

// src/types.ts
var import_viem = require("viem");
var DEFAULT_CELO_TOKEN = "cusd";
var CELO_TOKENS_MAINNET = {
  cusd: {
    id: "cusd",
    label: "cUSD",
    symbol: "cUSD",
    decimals: 18,
    arcadeAddress: "0x678Ce8fF913457617EA3d5558c431043faaDD89F",
    tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a"
  },
  usdc: {
    id: "usdc",
    label: "USDC",
    symbol: "USDC",
    decimals: 6,
    arcadeAddress: "0x5dF7e848308dB212f5ABeD76d5749ea79668F027",
    tokenAddress: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C"
  },
  usdt: {
    id: "usdt",
    label: "USDT",
    symbol: "USDT",
    decimals: 6,
    arcadeAddress: "0x3ae4aee0D6e8Fd7f3B038171Dc920034779Ab391",
    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e"
  }
};
function celoTokenMeta(token = DEFAULT_CELO_TOKEN, registry = CELO_TOKENS_MAINNET) {
  const meta = registry[token];
  if (!meta) throw new Error(`Unknown token "${token}". Valid: cusd, usdc, usdt`);
  return meta;
}
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
var ARCADE_ABI = [
  {
    type: "function",
    name: "startSession",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "stake", type: "uint256" },
      { name: "maxRounds", type: "uint8" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "multiplierBp", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "cancelExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: []
  },
  {
    type: "function",
    name: "freeTreasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "fundTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdrawFree",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "trustedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }]
  }
];
var ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }
];
var BPS = 1e4;
var STEP_BPS = 1e3;
function clampMultiplierBp(bp, maxRounds) {
  const max = BPS + STEP_BPS * maxRounds;
  return Math.min(Math.max(0, bp), max);
}
function maxMultiplierBp(maxRounds) {
  return BPS + STEP_BPS * maxRounds;
}
function computePayout(effectiveStake, multiplierBp) {
  return effectiveStake * BigInt(multiplierBp) / BigInt(BPS);
}

// src/celo.ts
var import_viem2 = require("viem");
var import_accounts = require("viem/accounts");
async function signEvmSettlement({
  sessionId,
  multiplierBp,
  token = "cusd",
  signerPrivateKey,
  chainId = 42220,
  arcadeAddress,
  tokenRegistry = CELO_TOKENS_MAINNET
}) {
  const meta = celoTokenMeta(token, tokenRegistry);
  const verifyingContract = arcadeAddress ?? meta.arcadeAddress;
  const account = (0, import_accounts.privateKeyToAccount)(signerPrivateKey);
  return account.signTypedData({
    domain: {
      name: "QuizArcade",
      version: "1",
      chainId,
      verifyingContract
    },
    types: {
      Settlement: [
        { name: "sessionId", type: "bytes32" },
        { name: "multiplierBp", type: "uint256" }
      ]
    },
    primaryType: "Settlement",
    message: {
      sessionId,
      multiplierBp: BigInt(multiplierBp)
    }
  });
}
function createCeloClient(rpcUrl = "https://forno.celo.org") {
  return (0, import_viem2.createPublicClient)({
    chain: celoMainnet,
    transport: (0, import_viem2.http)(rpcUrl)
  });
}
function createArcadeReader(options = {}) {
  const {
    token = "cusd",
    rpcUrl = "https://forno.celo.org",
    tokenRegistry = CELO_TOKENS_MAINNET
  } = options;
  const meta = celoTokenMeta(token, tokenRegistry);
  const publicClient = createCeloClient(rpcUrl);
  return {
    meta,
    async freeTreasury() {
      return publicClient.readContract({
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "freeTreasury"
      });
    },
    async tokenBalance(address) {
      return publicClient.readContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address]
      });
    },
    async allowance(owner) {
      return publicClient.readContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner, meta.arcadeAddress]
      });
    }
  };
}
function createArcadeClient(options = {}) {
  const {
    token = "cusd",
    rpcUrl = "https://forno.celo.org",
    tokenRegistry = CELO_TOKENS_MAINNET
  } = options;
  const meta = celoTokenMeta(token, tokenRegistry);
  const publicClient = createCeloClient(rpcUrl);
  const reader = createArcadeReader(options);
  function walletClient(privateKey) {
    const account = (0, import_accounts.privateKeyToAccount)(privateKey);
    const wc = (0, import_viem2.createWalletClient)({
      account,
      chain: celoMainnet,
      transport: (0, import_viem2.http)(rpcUrl)
    });
    return { wc, account };
  }
  return {
    ...reader,
    async approve(playerKey, amount) {
      const { wc, account } = walletClient(playerKey);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [meta.arcadeAddress, amount]
      });
    },
    async startSession(playerKey, sessionId, stake, maxRounds) {
      const { wc, account } = walletClient(playerKey);
      const stakeWei = (0, import_viem2.parseUnits)(stake, meta.decimals);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "startSession",
        args: [sessionId, stakeWei, maxRounds]
      });
    },
    async settle(playerKey, { sessionId, multiplierBp, signature }) {
      const { wc, account } = walletClient(playerKey);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "settle",
        args: [sessionId, BigInt(multiplierBp), signature]
      });
    },
    async cancelExpired(callerKey, sessionId) {
      const { wc, account } = walletClient(callerKey);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "cancelExpired",
        args: [sessionId]
      });
    }
  };
}
function parseStake(amount, token = "cusd") {
  return (0, import_viem2.parseUnits)(amount, celoTokenMeta(token).decimals);
}

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
  ARCADE_ABI,
  BPS,
  CELO_TOKENS_MAINNET,
  DEFAULT_CELO_TOKEN,
  ERC20_ABI,
  STACKS_CONTRACT_MAINNET,
  STEP_BPS,
  buildSettleArgs,
  buildStartSessionArgs,
  celoMainnet,
  celoTokenMeta,
  clampMultiplierBp,
  computePayout,
  createArcadeClient,
  createArcadeReader,
  createCeloClient,
  maxMultiplierBp,
  parseStake,
  signEvmSettlement,
  signStacksSettlement,
  stacksNetwork
});
