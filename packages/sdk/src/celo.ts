// @greyw0rks/arcadia/celo
// Celo chain utilities: EIP-712 signing, viem client helpers, arcade interactions.

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type PublicClient,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  celoMainnet,
  celoTokenMeta,
  ARCADE_ABI,
  ERC20_ABI,
  clampMultiplierBp,
  type CeloToken,
  type CeloTokenMeta,
  type SettlementParams,
  CELO_TOKENS_MAINNET,
} from "./types.js";

// ── EIP-712 signing ───────────────────────────────────────────────────────────

export interface SignEvmSettlementOptions {
  sessionId: `0x${string}`;
  multiplierBp: number;
  token?: CeloToken;
  signerPrivateKey: `0x${string}`;
  chainId?: number;
  arcadeAddress?: `0x${string}`;
  tokenRegistry?: typeof CELO_TOKENS_MAINNET;
}

/**
 * Sign a settlement for the Celo QuizArcade contract using EIP-712.
 * The verifyingContract is the arcade contract for the given token.
 */
export async function signEvmSettlement({
  sessionId,
  multiplierBp,
  token = "cusd",
  signerPrivateKey,
  chainId = 42220,
  arcadeAddress,
  tokenRegistry = CELO_TOKENS_MAINNET,
}: SignEvmSettlementOptions): Promise<`0x${string}`> {
  const meta = celoTokenMeta(token, tokenRegistry);
  const verifyingContract = arcadeAddress ?? meta.arcadeAddress;
  const account = privateKeyToAccount(signerPrivateKey);

  return account.signTypedData({
    domain: {
      name: "QuizArcade",
      version: "1",
      chainId,
      verifyingContract,
    },
    types: {
      Settlement: [
        { name: "sessionId", type: "bytes32" },
        { name: "multiplierBp", type: "uint256" },
      ],
    },
    primaryType: "Settlement",
    message: {
      sessionId,
      multiplierBp: BigInt(multiplierBp),
    },
  });
}

// ── Public client ─────────────────────────────────────────────────────────────

export function createCeloClient(rpcUrl = "https://forno.celo.org"): PublicClient {
  return createPublicClient({
    chain: celoMainnet,
    transport: http(rpcUrl),
  });
}

// ── Arcade client ─────────────────────────────────────────────────────────────

export interface ArcadeClientOptions {
  token?: CeloToken;
  rpcUrl?: string;
  tokenRegistry?: typeof CELO_TOKENS_MAINNET;
}

export interface ArcadeReadClient {
  meta: CeloTokenMeta;
  freeTreasury(): Promise<bigint>;
  tokenBalance(address: `0x${string}`): Promise<bigint>;
  allowance(owner: `0x${string}`): Promise<bigint>;
}

export interface ArcadeWriteClient extends ArcadeReadClient {
  startSession(
    playerKey: `0x${string}`,
    sessionId: `0x${string}`,
    stake: string,
    maxRounds: number
  ): Promise<Hash>;
  settle(
    playerKey: `0x${string}`,
    params: SettlementParams
  ): Promise<Hash>;
  cancelExpired(
    callerKey: `0x${string}`,
    sessionId: `0x${string}`
  ): Promise<Hash>;
  approve(
    playerKey: `0x${string}`,
    amount: bigint
  ): Promise<Hash>;
}

/**
 * Create a read-only Arcade client for a given token.
 */
export function createArcadeReader(options: ArcadeClientOptions = {}): ArcadeReadClient {
  const {
    token = "cusd",
    rpcUrl = "https://forno.celo.org",
    tokenRegistry = CELO_TOKENS_MAINNET,
  } = options;

  const meta = celoTokenMeta(token, tokenRegistry);
  const publicClient = createCeloClient(rpcUrl);

  return {
    meta,
    async freeTreasury() {
      return publicClient.readContract({
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "freeTreasury",
      }) as Promise<bigint>;
    },
    async tokenBalance(address) {
      return publicClient.readContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      }) as Promise<bigint>;
    },
    async allowance(owner) {
      return publicClient.readContract({
        address: meta.tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner, meta.arcadeAddress],
      }) as Promise<bigint>;
    },
  };
}

/**
 * Create a full read+write Arcade client for a given token.
 */
export function createArcadeClient(options: ArcadeClientOptions = {}): ArcadeWriteClient {
  const {
    token = "cusd",
    rpcUrl = "https://forno.celo.org",
    tokenRegistry = CELO_TOKENS_MAINNET,
  } = options;

  const meta = celoTokenMeta(token, tokenRegistry);
  const publicClient = createCeloClient(rpcUrl);
  const reader = createArcadeReader(options);

  function walletClient(privateKey: `0x${string}`) {
    const account = privateKeyToAccount(privateKey);
    const wc = createWalletClient({
      account,
      chain: celoMainnet,
      transport: http(rpcUrl),
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
        args: [meta.arcadeAddress, amount],
      });
    },
    async startSession(playerKey, sessionId, stake, maxRounds) {
      const { wc, account } = walletClient(playerKey);
      const stakeWei = parseUnits(stake, meta.decimals);
      return wc.writeContract({
        account,
        chain: celoMainnet,
        address: meta.arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "startSession",
        args: [sessionId, stakeWei, maxRounds],
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
        args: [sessionId, BigInt(multiplierBp), signature],
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
        args: [sessionId],
      });
    },
  };
}

// ── Utility: parse stake ──────────────────────────────────────────────────────

/** Parse a human-readable stake amount to wei for the given token */
export function parseStake(amount: string, token: CeloToken = "cusd"): bigint {
  return parseUnits(amount, celoTokenMeta(token).decimals);
}
