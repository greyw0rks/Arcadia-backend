// Shared chain + contract constants used by both client and server.
import { defineChain } from "viem";
import { celo as viemCelo, celoSepolia as viemCeloSepolia } from "viem/chains";

export type ChainId = "celo";

// ---------------------------------------------------------------------------
// QuizArcade v2 — single contract address, multi-token.
// The v2 contract accepts USDm, USDC, and USDT in one deployment; the `token`
// address is passed explicitly in every startSession call and included in the
// EIP-712 settlement signature to prevent cross-token replay.
// ---------------------------------------------------------------------------
export const ARCADE_ADDRESS = (process.env.NEXT_PUBLIC_ARCADE_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// "mainnet" | "testnet". Drives which Celo network the app + signer target. Defaults to mainnet.
export const CELO_NETWORK_NAME = (process.env.NEXT_PUBLIC_CELO_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

// Canonical Celo mainnet cUSD / USDm (Mento stablecoin, 18 decimals).
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

// Use canonical viem/chains definitions as the base, overriding only the RPC URL.
// Chain IDs: mainnet = 42220, Celo Sepolia testnet = 11142220.
const baseCeloChain = CELO_NETWORK_NAME === "mainnet" ? viemCelo : viemCeloSepolia;
export const celoChain = defineChain({
  ...baseCeloChain,
  rpcUrls: { default: { http: [RPC_URL] } },
});

// ---------------------------------------------------------------------------
// Celo stake-token registry
//
// All three tokens (USDm 18 dec, USDC 6 dec, USDT 6 dec) share ONE QuizArcade v2
// instance (ARCADE_ADDRESS). The `tokenAddress` is passed to the contract at
// startSession time. The backend signer signs `(sessionId, multiplierBp, tokenAddress)`
// so a signature for USDm cannot be replayed against USDC.
// ---------------------------------------------------------------------------

export type CeloToken = "cusd" | "usdc" | "usdt";

export interface CeloTokenMeta {
  id: CeloToken;
  label: string;
  symbol: string;
  decimals: number;
  tokenAddress: `0x${string}`; // the ERC-20 stake token passed to startSession
  feeCurrencyAddress: `0x${string}` | null; // CIP-64 feeCurrency (null on testnet / unknown)
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// Canonical Celo mainnet token addresses.
// Decimals: USDm = 18, USDC = 6, USDT = 6.
// Source: https://github.com/celo-org/celopedia-skills (contracts.md)
const MAINNET_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const MAINNET_USDT = "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e";

// CIP-64 feeCurrency addresses (mainnet). USDC/USDT use adapter contracts — the raw token address
// is NOT valid as feeCurrency; only the adapter normalises to the expected 18-decimal interface.
// USDm's token address IS the feeCurrency address (no adapter needed).
// Source: https://github.com/celo-org/celopedia-skills (network-info.md)
const MAINNET_FEE_CURRENCIES: Record<CeloToken, `0x${string}`> = {
  cusd: "0x765DE816845861e75A25fCA122bb6898B8B1282a",  // USDm — token IS the feeCurrency
  usdc: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",  // USDC adapter
  usdt: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72",  // USDT adapter
};

function envAddr(name: string, fallback: string): `0x${string}` {
  return (process.env[name] ?? fallback) as `0x${string}`;
}

export const CELO_TOKENS: Record<CeloToken, CeloTokenMeta> = {
  // cUSD is branded as USDm (Mento branding) in the UI.
  cusd: {
    id: "cusd",
    label: "USDm",
    symbol: "USDm",
    decimals: 18,
    tokenAddress: CUSD_ADDRESS,
    feeCurrencyAddress: CELO_NETWORK_NAME === "mainnet" ? MAINNET_FEE_CURRENCIES.cusd : null,
  },
  usdc: {
    id: "usdc",
    label: "USDC",
    symbol: "USDC",
    decimals: 6,
    tokenAddress: envAddr(
      "NEXT_PUBLIC_TOKEN_ADDRESS_USDC",
      CELO_NETWORK_NAME === "mainnet" ? MAINNET_USDC : ZERO_ADDRESS
    ),
    feeCurrencyAddress: CELO_NETWORK_NAME === "mainnet" ? MAINNET_FEE_CURRENCIES.usdc : null,
  },
  usdt: {
    id: "usdt",
    label: "USDT",
    symbol: "USDT",
    decimals: 6,
    tokenAddress: envAddr(
      "NEXT_PUBLIC_TOKEN_ADDRESS_USDT",
      CELO_NETWORK_NAME === "mainnet" ? MAINNET_USDT : ZERO_ADDRESS
    ),
    feeCurrencyAddress: CELO_NETWORK_NAME === "mainnet" ? MAINNET_FEE_CURRENCIES.usdt : null,
  },
};

export const DEFAULT_CELO_TOKEN: CeloToken = "cusd";

/** Resolve a token's metadata, falling back to the default (USDm) for an unknown/legacy value. */
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
