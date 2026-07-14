"use client";

import { useAccount, usePublicClient, useWriteContract, useSendTransaction } from "wagmi";
import { parseUnits, encodeFunctionData } from "viem";
import { ARCADE_ADDRESS, celoTokenMeta, DEFAULT_CELO_TOKEN, type CeloToken } from "./contract";
import { ARCADE_ABI, ERC20_ABI } from "./abi";

// ERC-8021 attribution tag appended to every arcade transaction calldata so Celo's
// on-chain attribution indexer can credit volume to Arcadia. The EVM ignores trailing
// calldata; contracts never see it.
// Wire format: <code_utf8><len_byte><schema=0x00><marker:16 bytes>
// code = "arcadia" (7 bytes, hex 61726361646961), schema 0.
const ARCADIA_ATTRIBUTION_SUFFIX = "61726361646961070080218021802180218021802180218021";

// Detect MiniPay wallet — it injects window.ethereum.isMiniPay. MiniPay manages feeCurrency
// itself, so we must NOT pass a custom feeCurrency or the tx will be rejected.
export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  return (window as { ethereum?: { isMiniPay?: boolean } }).ethereum?.isMiniPay === true;
}

export interface ArcadeApi {
  startSession: (sessionId: `0x${string}`, stake: string, maxRounds: number) => Promise<void>;
  settle: (
    sessionId: `0x${string}`,
    multiplierBp: number,
    signature: `0x${string}`
  ) => Promise<void>;
  cancelExpired: (sessionId: `0x${string}`) => Promise<void>;
  balance: () => Promise<bigint>;
}

// ---------------------------------------------------------------------------
// Celo (EVM) — wagmi/viem, with ERC-20 approve, CIP-64 fee abstraction, and ERC-8021 tagging.
// ---------------------------------------------------------------------------

function useCeloArcade(token: CeloToken): ArcadeApi {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const { tokenAddress, decimals, feeCurrencyAddress } = celoTokenMeta(token);

  // Build the CIP-64 feeCurrency extra field. Skip on MiniPay (it manages feeCurrency itself,
  // using USDm — its only supported fee token regardless of what the user is staking with).
  // Skip if feeCurrencyAddress is null (testnet — adapters may not be deployed).
  const feeCurrency = feeCurrencyAddress && !isMiniPay()
    ? feeCurrencyAddress
    : undefined;

  // Encode calldata, append ERC-8021 attribution tag, and send with CIP-64 feeCurrency.
  async function sendArcade(
    functionName: "startSession" | "settle" | "cancelExpired",
    args: unknown[]
  ): Promise<`0x${string}`> {
    const calldata = encodeFunctionData({ abi: ARCADE_ABI, functionName, args } as Parameters<typeof encodeFunctionData>[0]);
    const data = (calldata + ARCADIA_ATTRIBUTION_SUFFIX) as `0x${string}`;
    // MiniPay only processes legacy (type 0) transactions — it ignores EIP-1559 fee fields.
    // Pass type: 0 explicitly so wagmi doesn't upgrade to type 2 inside MiniPay.
    const miniPay = isMiniPay();
    return sendTransactionAsync({
      to: ARCADE_ADDRESS,
      data,
      ...(feeCurrency ? { feeCurrency } : {}),
      ...(miniPay ? { type: "legacy" } : {}),
    });
  }

  async function ensureAllowance(stakeWei: bigint) {
    if (!address || !publicClient) throw new Error("wallet not connected");
    const current = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, ARCADE_ADDRESS],
    })) as bigint;
    if (current >= stakeWei) return;
    // Approve with feeCurrency so users don't need CELO for the allowance step either.
    const hash = await writeContractAsync({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ARCADE_ADDRESS, stakeWei],
      ...(feeCurrency ? { feeCurrency } : {}),
    } as Parameters<typeof writeContractAsync>[0]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  return {
    async startSession(sessionId, stake, maxRounds) {
      if (!publicClient) throw new Error("no client");
      const stakeWei = parseUnits(stake, decimals);
      await ensureAllowance(stakeWei);
      // v2: pass token address as second arg (prevents cross-token routing and is verified on-chain).
      const hash = await sendArcade("startSession", [sessionId, tokenAddress, stakeWei, maxRounds]);
      await publicClient.waitForTransactionReceipt({ hash });
    },
    async settle(sessionId, multiplierBp, signature) {
      if (!publicClient) throw new Error("no client");
      const hash = await sendArcade("settle", [sessionId, BigInt(multiplierBp), signature]);
      await publicClient.waitForTransactionReceipt({ hash });
    },
    async cancelExpired(sessionId) {
      if (!publicClient) throw new Error("no client");
      const hash = await sendArcade("cancelExpired", [sessionId]);
      await publicClient.waitForTransactionReceipt({ hash });
    },
    async balance() {
      if (!address || !publicClient) return 0n;
      return (await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
    },
  };
}

export function useArcade(token: CeloToken = DEFAULT_CELO_TOKEN): ArcadeApi {
  return useCeloArcade(token);
}
