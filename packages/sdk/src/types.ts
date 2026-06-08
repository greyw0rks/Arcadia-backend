// @greyw0rks/arcadia — types and constants
// Central registry for all chains, tokens, and contract metadata.

import { defineChain, type Chain } from "viem";

// ── Chain types ───────────────────────────────────────────────────────────────

export type ChainId = "celo" | "stacks";

export type CeloToken = "cusd" | "usdc" | "usdt";

// ── Token registry ────────────────────────────────────────────────────────────

export interface CeloTokenMeta {
  id: CeloToken;
  label: string;
  symbol: string;
  decimals: number;
  arcadeAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
}

export const DEFAULT_CELO_TOKEN: CeloToken = "cusd";

/** Mainnet token + arcade contract registry. Override addresses via env or explicit config. */
export const CELO_TOKENS_MAINNET: Record<CeloToken, CeloTokenMeta> = {
  cusd: {
    id: "cusd",
    label: "cUSD",
    symbol: "cUSD",
    decimals: 18,
    arcadeAddress: "0x678Ce8fF913457617EA3d5558c431043faaDD89F",
    tokenAddress: "0x765DE816845861e75A25fCA122bb6898B8B1282a",
  },
  usdc: {
    id: "usdc",
    label: "USDC",
    symbol: "USDC",
    decimals: 6,
    arcadeAddress: "0x5dF7e848308dB212f5ABeD76d5749ea79668F027",
    tokenAddress: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  },
  usdt: {
    id: "usdt",
    label: "USDT",
    symbol: "USDT",
    decimals: 6,
    arcadeAddress: "0x3ae4aee0D6e8Fd7f3B038171Dc920034779Ab391",
    tokenAddress: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  },
};

export function celoTokenMeta(
  token: CeloToken = DEFAULT_CELO_TOKEN,
  registry: Record<CeloToken, CeloTokenMeta> = CELO_TOKENS_MAINNET
): CeloTokenMeta {
  const meta = registry[token];
  if (!meta) throw new Error(`Unknown token "${token}". Valid: cusd, usdc, usdt`);
  return meta;
}

// ── Stacks constants ──────────────────────────────────────────────────────────

export const STACKS_CONTRACT_MAINNET = {
  address: "SP1SY1E599GN04XRD2DQBKV7E62HYBJR2CT9S5QKK",
  name: "quiz-arcade",
  trustedSignerPubkey:
    "0x024563149f07fdcdffb5bed5dc367c690ea7ee6491f7ed5edcbcbcb3b6354ead62",
} as const;

// ── Celo chain config (viem) ──────────────────────────────────────────────────

export const celoMainnet: Chain = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo.org"] },
    public: { http: ["https://forno.celo.org"] },
  },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://celoscan.io" },
  },
});

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const ARCADE_ABI = [
  {
    type: "function",
    name: "startSession",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "stake", type: "uint256" },
      { name: "maxRounds", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "sessionId", type: "bytes32" },
      { name: "multiplierBp", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "sessionId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "freeTreasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "fundTreasury",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawFree",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "trustedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

// ── Session types ─────────────────────────────────────────────────────────────

export interface SessionMeta {
  sessionId: `0x${string}`;
  player: `0x${string}`;
  stake: bigint;
  effectiveStake: bigint;
  maxRounds: number;
  expiry: number;
  token: CeloToken;
  chain: ChainId;
}

export interface SettlementParams {
  sessionId: `0x${string}`;
  multiplierBp: number;
  signature: `0x${string}`;
}

// ── Multiplier math ───────────────────────────────────────────────────────────

export const BPS = 10_000;
export const STEP_BPS = 1_000;

/** Clamp a multiplier to the session's ceiling: BPS + STEP_BPS * maxRounds */
export function clampMultiplierBp(bp: number, maxRounds: number): number {
  const max = BPS + STEP_BPS * maxRounds;
  return Math.min(Math.max(0, bp), max);
}

/** Max possible multiplier for a given round count */
export function maxMultiplierBp(maxRounds: number): number {
  return BPS + STEP_BPS * maxRounds;
}

/** Compute payout from effectiveStake and multiplierBp */
export function computePayout(effectiveStake: bigint, multiplierBp: number): bigint {
  return (effectiveStake * BigInt(multiplierBp)) / BigInt(BPS);
}
