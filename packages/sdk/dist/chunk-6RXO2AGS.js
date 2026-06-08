// src/types.ts
import { defineChain } from "viem";
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
var celoMainnet = defineChain({
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

export {
  DEFAULT_CELO_TOKEN,
  CELO_TOKENS_MAINNET,
  celoTokenMeta,
  STACKS_CONTRACT_MAINNET,
  celoMainnet,
  ARCADE_ABI,
  ERC20_ABI,
  BPS,
  STEP_BPS,
  clampMultiplierBp,
  maxMultiplierBp,
  computePayout
};
