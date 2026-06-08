"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/celo.ts
var celo_exports = {};
__export(celo_exports, {
  createArcadeClient: () => createArcadeClient,
  createArcadeReader: () => createArcadeReader,
  createCeloClient: () => createCeloClient,
  parseStake: () => parseStake,
  signEvmSettlement: () => signEvmSettlement
});
module.exports = __toCommonJS(celo_exports);
var import_viem2 = require("viem");
var import_accounts = require("viem/accounts");

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

// src/celo.ts
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
    return (0, import_viem2.createWalletClient)({
      account: (0, import_accounts.privateKeyToAccount)(privateKey),
      chain: celoMainnet,
      transport: (0, import_viem2.http)(rpcUrl)
    });
  }
  return {
    ...reader,
    async approve(playerKey, amount) {
      const wc = walletClient(playerKey);
      return wc.writeContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [meta.arcadeAddress, amount]
      });
    },
    async startSession(playerKey, sessionId, stake, maxRounds) {
      const wc = walletClient(playerKey);
      const stakeWei = (0, import_viem2.parseUnits)(stake, meta.decimals);
      return wc.writeContract({
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "startSession",
        args: [sessionId, stakeWei, maxRounds]
      });
    },
    async settle(playerKey, { sessionId, multiplierBp, signature }) {
      const wc = walletClient(playerKey);
      return wc.writeContract({
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "settle",
        args: [sessionId, BigInt(multiplierBp), signature]
      });
    },
    async cancelExpired(callerKey, sessionId) {
      const wc = walletClient(callerKey);
      return wc.writeContract({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createArcadeClient,
  createArcadeReader,
  createCeloClient,
  parseStake,
  signEvmSettlement
});
