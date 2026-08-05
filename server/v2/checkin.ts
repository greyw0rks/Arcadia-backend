// server/v2/checkin.ts — the daily check-in that opens a player's free rounds.
//
// A player sends one 0-value transaction to ArcadiaPool.checkIn() per day. Until it lands, the
// day's free-round allowance is locked; entry-paid and purchased rounds are unaffected.
//
// WHY THE TRANSACTION IS LOAD-BEARING RATHER THAN DECORATIVE. The point of the check-in is that
// Arcadia's on-chain record reflects real daily use — Talent Protocol credits a contract deployer
// with transaction counts on contracts they deployed, and Celo Proof of Ship weighs "real on-chain
// activity from real users". A transaction that did nothing would be exactly the "reward farming"
// pattern both programmes name as disqualifying, so it is wired to something a player actually
// wants: it unlocks play. One transaction per genuinely-active player per day, and none from anyone
// who is not playing — the on-chain number is then a truthful DAU, not an inflated one.
//
// It cannot be farmed for volume: the contract reverts a second check-in on the same UTC day, so
// the count is bounded above by (players × days) no matter what anyone does.
//
// Read from the contract's view rather than by scanning logs (as entry.ts must). `checkedInToday`
// answers exactly the question being asked, in one call, with no lookback window to tune and no
// dependence on how far back the RPC will serve eth_getLogs.

import { createPublicClient, http, getAddress, encodeFunctionData } from "viem";
import { celoChain, RPC_URL } from "../../lib/contract";
import { poolAddress } from "./entry";

const publicClient = createPublicClient({ chain: celoChain, transport: http(RPC_URL) });

const CHECKIN_ABI = [
  {
    type: "function",
    name: "checkedInToday",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "checkIn",
    stateMutability: "nonpayable",
    inputs: [{ name: "weekId", type: "uint256" }],
    outputs: [],
  },
] as const;

export interface CheckInRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  /** Always "0x0" — a check-in moves no value. Stated explicitly so the UI can promise it. */
  value: "0x0";
}

/**
 * The transaction a player sends to open their day. Built server-side so the client never has to
 * hold an ABI or the contract address.
 *
 * Null when no pool is configured, which is also when the gate is off — the UI then has nothing to
 * prompt for, which is the correct outcome rather than an error.
 */
export function checkInRequest(weekId: number): CheckInRequest | null {
  const pool = poolAddress();
  if (!pool) return null;
  return {
    to: pool,
    data: encodeFunctionData({ abi: CHECKIN_ABI, functionName: "checkIn", args: [BigInt(weekId)] }),
    value: "0x0",
  };
}

/**
 * Is the daily check-in gate active on this deploy?
 *
 * Off when the pool address is unset — the same condition that disables paid-entry verification.
 * A deploy without the contract cannot verify a check-in, and locking every player out of their
 * free rounds because the operator has not wired an address yet would be worse than not gating.
 * `V2_REQUIRE_CHECKIN=false` disables it explicitly for local work.
 */
export function checkInGateOn(): boolean {
  return poolAddress() !== null && process.env.V2_REQUIRE_CHECKIN !== "false";
}

/**
 * Has `player` opened today on-chain?
 *
 * Returns true when the gate is off, so callers read as "allowed to play" rather than having to
 * special-case an unconfigured deploy.
 *
 * FAILS OPEN on an RPC error, deliberately. This gates a FREE allowance, not money: the downside of
 * a false "yes" is a player getting ten free rounds they did not check in for, while the downside of
 * a false "no" is every player locked out of the game whenever the RPC has a bad minute. Paid entry
 * (entry.ts) makes the opposite trade, and should — it guards the pot.
 */
export async function hasCheckedInToday(player: string): Promise<boolean> {
  const pool = poolAddress();
  if (!pool || !checkInGateOn()) return true;

  try {
    return await publicClient.readContract({
      address: pool,
      abi: CHECKIN_ABI,
      functionName: "checkedInToday",
      args: [getAddress(player)],
    });
  } catch (err) {
    console.error("[v2/checkin] read failed, allowing play:", err);
    return true;
  }
}
