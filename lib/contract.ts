// Shared chain + contract constants used by both client and server.
import { defineChain } from "viem";
import { StacksTestnet, StacksMainnet, type StacksNetwork } from "@stacks/network";

// Which networks the app supports. Used by the UI chain switcher and the chain-aware play flow.
export type ChainId = "celo" | "stacks";

export const ARCADE_ADDRESS = (process.env.NEXT_PUBLIC_ARCADE_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// "mainnet" | "testnet". Drives which Celo network the app + signer target. Defaults to mainnet.
export const CELO_NETWORK_NAME = (process.env.NEXT_PUBLIC_CELO_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

// Canonical Celo mainnet cUSD (Mento stablecoin, 18 decimals). On testnet we deploy a mintable
// "Test cUSD" (see contracts/Deploy.s.sol) and set NEXT_PUBLIC_CUSD_ADDRESS from the deploy output.
const MAINNET_CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
export const CUSD_ADDRESS = (process.env.NEXT_PUBLIC_CUSD_ADDRESS ??
  (CELO_NETWORK_NAME === "mainnet"
    ? MAINNET_CUSD
    : "0x0000000000000000000000000000000000000000")) as `0x${string}`;

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  (CELO_NETWORK_NAME === "mainnet"
    ? "https://forno.celo.org"
    : "https://forno.celo-sepolia.celo-testnet.org/");

// Celo mainnet (chain id 42220).
export const celoMainnet = defineChain({
  id: 42220,
  name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo.org"] } },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://celoscan.io" },
  },
});

// Celo Sepolia testnet (chain id 11142220) — Celo's L2 testnet that replaced Alfajores.
export const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "Celo Sepolia", symbol: "S-CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org/"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://celo-sepolia.blockscout.com" },
  },
  testnet: true,
});

// The active Celo chain (mainnet by default). Used by wagmi, the server reader, and the EIP-712
// signer domain — the domain chainId MUST match the deployed network or every settle() reverts.
const baseCeloChain = CELO_NETWORK_NAME === "mainnet" ? celoMainnet : celoSepolia;
export const celoChain = defineChain({
  ...baseCeloChain,
  rpcUrls: { default: { http: [RPC_URL] } },
});

// ---------------------------------------------------------------------------
// Stacks (Clarity) config
// ---------------------------------------------------------------------------

// Deployed contract id, e.g. "ST1PQ….quiz-arcade". Set from the Clarinet/Hiro deploy output.
export const STACKS_ARCADE_CONTRACT =
  process.env.NEXT_PUBLIC_STACKS_ARCADE_CONTRACT ??
  "ST000000000000000000002AMW42H.quiz-arcade";

// "testnet" | "mainnet". Drives the Stacks.js network + which wallet network the user is asked for.
// Defaults to mainnet (the project ships on mainnet; set NEXT_PUBLIC_STACKS_NETWORK=testnet to test).
export const STACKS_NETWORK_NAME = (process.env.NEXT_PUBLIC_STACKS_NETWORK ?? "mainnet") as
  | "testnet"
  | "mainnet";

export const STACKS_API_URL =
  process.env.NEXT_PUBLIC_STACKS_API_URL ??
  (STACKS_NETWORK_NAME === "mainnet"
    ? "https://api.mainnet.hiro.so"
    : "https://api.testnet.hiro.so");

export function stacksNetwork(): StacksNetwork {
  return STACKS_NETWORK_NAME === "mainnet"
    ? new StacksMainnet({ url: STACKS_API_URL })
    : new StacksTestnet({ url: STACKS_API_URL });
}

export const STACKS_EXPLORER =
  STACKS_NETWORK_NAME === "mainnet"
    ? "https://explorer.hiro.so"
    : "https://explorer.hiro.so/?chain=testnet";

// ---------------------------------------------------------------------------
// Per-chain UI metadata (stake symbol + token decimals) for the chain switcher.
// ---------------------------------------------------------------------------

export interface ChainMeta {
  id: ChainId;
  label: string;
  stakeSymbol: string; // what the player stakes
  decimals: number; // stake-token decimals for parse/format
}

export const CHAINS: Record<ChainId, ChainMeta> = {
  celo: { id: "celo", label: "Celo", stakeSymbol: "cUSD", decimals: 18 },
  stacks: { id: "stacks", label: "Stacks", stakeSymbol: "STX", decimals: 6 },
};

// ---------------------------------------------------------------------------
// Celo stake-token registry (Option A: one audited QuizArcade instance per token).
//
// The deployed contract is hardwired to a single immutable stake token, so accepting cUSD, USDC, and
// USDT means deploying one instance per token. The token is therefore a routing dimension exactly
// like the chain: each instance has a DISTINCT EIP-712 verifyingContract, so the backend signer must
// sign for the right one or settle() reverts BadSignature. All three live on Celo mainnet (42220,
// same RPC) — only the arcade address, token address, and decimals differ (cUSD 18, USDC/USDT 6).
// ---------------------------------------------------------------------------

export type CeloToken = "cusd" | "usdc" | "usdt";

export interface CeloTokenMeta {
  id: CeloToken;
  label: string;
  symbol: string;
  decimals: number;
  arcadeAddress: `0x${string}`; // the QuizArcade instance deployed against this token
  tokenAddress: `0x${string}`; // the ERC-20 stake token
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// Canonical Celo mainnet token addresses (decimals: USDC/USDT are 6, cUSD is 18).
const MAINNET_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const MAINNET_USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

function envAddr(name: string, fallback: string): `0x${string}` {
  return (process.env[name] ?? fallback) as `0x${string}`;
}

export const CELO_TOKENS: Record<CeloToken, CeloTokenMeta> = {
  // cUSD reuses the EXISTING arcade + token env vars for back-compat (the cUSD instance is already
  // deployed). The two new instances are configured via the *_USDC / *_USDT vars.
  cusd: {
    id: "cusd",
    label: "cUSD",
    symbol: "cUSD",
    decimals: 18,
    arcadeAddress: ARCADE_ADDRESS,
    tokenAddress: CUSD_ADDRESS,
  },
  usdc: {
    id: "usdc",
    label: "USDC",
    symbol: "USDC",
    decimals: 6,
    arcadeAddress: envAddr("NEXT_PUBLIC_ARCADE_ADDRESS_USDC", ZERO_ADDRESS),
    tokenAddress: envAddr(
      "NEXT_PUBLIC_TOKEN_ADDRESS_USDC",
      CELO_NETWORK_NAME === "mainnet" ? MAINNET_USDC : ZERO_ADDRESS
    ),
  },
  usdt: {
    id: "usdt",
    label: "USDT",
    symbol: "USDT",
    decimals: 6,
    arcadeAddress: envAddr("NEXT_PUBLIC_ARCADE_ADDRESS_USDT", ZERO_ADDRESS),
    tokenAddress: envAddr(
      "NEXT_PUBLIC_TOKEN_ADDRESS_USDT",
      CELO_NETWORK_NAME === "mainnet" ? MAINNET_USDT : ZERO_ADDRESS
    ),
  },
};

export const DEFAULT_CELO_TOKEN: CeloToken = "cusd";

/** Resolve a token's metadata, falling back to the default (cUSD) for an unknown/legacy value. */
export function celoTokenMeta(t: CeloToken | undefined): CeloTokenMeta {
  return (t && CELO_TOKENS[t]) || CELO_TOKENS[DEFAULT_CELO_TOKEN];
}

// Multiplier math constants (mirror the contract).
export const BPS = 10_000n;
export const STEP_BPS = 1_000n;
export const TRIVIA_MAX_ROUNDS = 5;

export function formatMultiplier(bp: bigint | number): string {
  const n = typeof bp === "bigint" ? Number(bp) : bp;
  return (n / 10_000).toFixed(1) + "x";
}
