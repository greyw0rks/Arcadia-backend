"use client";

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import {
  bufferCV,
  uintCV,
  cvToJSON,
  callReadOnlyFunction,
  ClarityType,
  PostConditionMode,
  FungibleConditionCode,
  makeStandardSTXPostCondition,
  AnchorMode,
} from "@stacks/transactions";
import {
  STACKS_ARCADE_CONTRACT,
  stacksNetwork,
  CHAINS,
  resolveTokenMeta,
  DEFAULT_CELO_TOKEN,
  type ChainId,
  type CeloToken,
} from "./contract";
import { ARCADE_ABI, ERC20_ABI } from "./abi";
import { useStacksWallet } from "./stacksWallet";

// A uniform interface the play flow uses regardless of chain. Each method resolves only once the
// chain reflects the action (EVM: tx receipt; Stacks: polled read-only state), so the UI can advance.
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
// EVM (Celo + Base) — wagmi/viem, with the ERC-20 approve step.
// ---------------------------------------------------------------------------

function useEvmArcade(chain: ChainId, token: CeloToken): ArcadeApi {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Resolve the arcade contract, stake token, and decimals for this chain+token combination.
  // Celo has three instances (USDM/USDC/USDT); Base has one (USDC). resolveTokenMeta handles both.
  const { arcadeAddress, tokenAddress, decimals } = resolveTokenMeta(chain, token);

  async function ensureAllowance(stakeWei: bigint) {
    if (!address || !publicClient) throw new Error("wallet not connected");
    const current = (await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, arcadeAddress],
    })) as bigint;
    if (current >= stakeWei) return;
    const hash = await writeContractAsync({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [arcadeAddress, stakeWei],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  return {
    async startSession(sessionId, stake, maxRounds) {
      if (!publicClient) throw new Error("no client");
      const stakeWei = parseUnits(stake, decimals);
      await ensureAllowance(stakeWei);
      const hash = await writeContractAsync({
        address: arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "startSession",
        args: [sessionId, stakeWei, maxRounds],
      });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    async settle(sessionId, multiplierBp, signature) {
      if (!publicClient) throw new Error("no client");
      const hash = await writeContractAsync({
        address: arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "settle",
        args: [sessionId, BigInt(multiplierBp), signature],
      });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    async cancelExpired(sessionId) {
      if (!publicClient) throw new Error("no client");
      const hash = await writeContractAsync({
        address: arcadeAddress,
        abi: ARCADE_ABI,
        functionName: "cancelExpired",
        args: [sessionId],
      });
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

// ---------------------------------------------------------------------------
// Stacks (Clarity) — Stacks Connect contract calls + read-only polling.
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const [STX_CONTRACT_ADDR, STX_CONTRACT_NAME] = STACKS_ARCADE_CONTRACT.split(".");

async function readSession(sessionId: `0x${string}`): Promise<any | null> {
  const res = await callReadOnlyFunction({
    contractAddress: STX_CONTRACT_ADDR,
    contractName: STX_CONTRACT_NAME,
    functionName: "get-session",
    functionArgs: [bufferCV(hexToBytes(sessionId))],
    network: await stacksNetwork(),
    senderAddress: STX_CONTRACT_ADDR,
  });
  if (res.type === ClarityType.OptionalNone) return null;
  return cvToJSON(res).value?.value ?? null;
}

// Poll the read-only state until `predicate` holds (the chain confirmed our call) or we time out.
async function pollUntil(
  predicate: (session: any | null) => boolean,
  sessionId: `0x${string}`,
  { tries = 40, intervalMs = 3000 } = {}
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      const s = await readSession(sessionId);
      if (predicate(s)) return;
    } catch {
      /* transient API error — keep polling */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for the Stacks transaction to confirm.");
}

// Wrap Stacks Connect's callback API in a promise that resolves on broadcast.
async function contractCall(opts: Record<string, unknown>): Promise<void> {
  const { openContractCall } = await import("@stacks/connect");
  return new Promise<void>((resolve, reject) => {
    try {
      const maybe = openContractCall({
        ...(opts as any),
        onFinish: () => resolve(),
        onCancel: () => reject(new Error("Transaction was cancelled in the wallet.")),
      }) as unknown;
      // Some @stacks/connect versions return a promise that rejects if the popup can't open.
      if (maybe && typeof (maybe as Promise<unknown>).catch === "function") {
        (maybe as Promise<unknown>).catch(reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

function useStacksArcade(): ArcadeApi {
  const { address } = useStacksWallet();

  return {
    async startSession(sessionId, stake, maxRounds) {
      if (!address) throw new Error("Stacks wallet not connected");
      const network = await stacksNetwork();
      const stakeMicro = parseUnits(stake, CHAINS.stacks.decimals); // bigint micro-STX
      await contractCall({
        contractAddress: STX_CONTRACT_ADDR,
        contractName: STX_CONTRACT_NAME,
        functionName: "start-session",
        functionArgs: [bufferCV(hexToBytes(sessionId)), uintCV(stakeMicro), uintCV(maxRounds)],
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Deny,
        postConditions: [
          // The player sends at most `stake` micro-STX (effective-stake to the contract + rake out).
          makeStandardSTXPostCondition(address, FungibleConditionCode.LessEqual, stakeMicro),
        ],
      });
      // Wait until the session exists on-chain for this player (the funding gate the backend enforces).
      await pollUntil(
        (s) => !!s && s.player?.value === address && s.settled?.value === false,
        sessionId
      );
    },
    async settle(sessionId, multiplierBp, signature) {
      const network = await stacksNetwork();
      await contractCall({
        contractAddress: STX_CONTRACT_ADDR,
        contractName: STX_CONTRACT_NAME,
        functionName: "settle",
        functionArgs: [
          bufferCV(hexToBytes(sessionId)),
          uintCV(multiplierBp),
          bufferCV(hexToBytes(signature)),
        ],
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow, // payout comes from the contract treasury
      });
      await pollUntil((s) => !!s && s.settled?.value === true, sessionId);
    },
    async cancelExpired(sessionId) {
      const network = await stacksNetwork();
      await contractCall({
        contractAddress: STX_CONTRACT_ADDR,
        contractName: STX_CONTRACT_NAME,
        functionName: "cancel-expired",
        functionArgs: [bufferCV(hexToBytes(sessionId))],
        network,
        anchorMode: AnchorMode.Any,
        postConditionMode: PostConditionMode.Allow,
      });
      await pollUntil((s) => !!s && s.settled?.value === true, sessionId);
    },
    async balance() {
      const network = await stacksNetwork();
      if (!address) return 0n;
      try {
        const res = await fetch(`${network.coreApiUrl}/extended/v1/address/${address}/balances`);
        const json = await res.json();
        return BigInt(json?.stx?.balance ?? "0");
      } catch {
        return 0n;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Dispatch. Both hooks are always called (Rules of Hooks); we return the active one.
// ---------------------------------------------------------------------------

export function useArcade(chain: ChainId, token: CeloToken = DEFAULT_CELO_TOKEN): ArcadeApi {
  const evm = useEvmArcade(chain, token);
  const stacks = useStacksArcade();
  return chain === "stacks" ? stacks : evm;
}
