// server/v2/entry.ts — confirm a run was paid for before it opens.
//
// Without this a tester could open unlimited runs for free: the engine tracked multipliers happily
// but nothing tied a run to money. That is the difference between a beta whose payouts mean
// something and one that does not.
//
// The check counts ArcadiaPool `Entered` events of kind ENTRY(0) or REBUY(1) for this wallet in
// this week, and requires strictly more paid entries than runs already opened.
//
// ⚠ It deliberately does NOT use the contract's `contributed` mapping, which is the obvious choice
// and is wrong. That mapping is an aggregate of ALL contributions including $0.10 extra-round
// tickets, so ten ticket purchases would sum to $1 and read as a paid entry. Kind must be checked,
// not just value — which is why the event carries it.

import { createPublicClient, http, parseAbiItem, getAddress } from "viem";
import { celoChain, RPC_URL } from "../../lib/contract";
import { mustQuery } from "./db";

const publicClient = createPublicClient({ chain: celoChain, transport: http(RPC_URL) });

const ENTERED_EVENT = parseAbiItem(
  "event Entered(uint256 indexed weekId, address indexed player, uint256 gross, uint256 net, uint8 kind)"
);

const KIND_ENTRY = 0;
const KIND_REBUY = 1;

/** The deployed ArcadiaPool. Absent on deploys that have not wired the contract yet. */
export function poolAddress(): `0x${string}` | null {
  const a = process.env.ARCADIA_POOL_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : null;
}

/**
 * How far back to scan for entry events. Celo's public RPC caps eth_getLogs ranges, and a week is
 * ~604,800 blocks at 1s. Scanning from the deploy block would exceed that, so the window is bounded
 * and configurable.
 */
function lookbackBlocks(): bigint {
  const n = Number(process.env.ARCADIA_POOL_LOOKBACK_BLOCKS);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) : 700_000n;
}

export interface EntryCheck {
  paidEntries: number;
  runsOpened: number;
  /** True when the player has paid for a run they have not yet opened. */
  canOpen: boolean;
}

/**
 * Count paid entries against runs already opened.
 *
 * Comparing counts rather than marking individual transactions as consumed keeps this stateless and
 * idempotent: a player who paid twice and opened once can open exactly one more run, whatever order
 * the requests arrive in. It also means a replayed request cannot open a second run, because the
 * run count rises with the first.
 */
export async function checkPaidEntry(
  weekId: number,
  player: string,
  chain: string
): Promise<EntryCheck> {
  const pool = poolAddress();
  if (!pool) {
    throw new Error("ARCADIA_POOL_ADDRESS is not set — cannot verify paid entry");
  }

  const latest = await publicClient.getBlockNumber();
  const lookback = lookbackBlocks();
  const fromBlock = latest > lookback ? latest - lookback : 0n;

  const logs = await publicClient.getLogs({
    address: pool,
    event: ENTERED_EVENT,
    args: { weekId: BigInt(weekId), player: getAddress(player) },
    fromBlock,
    toBlock: latest,
  });

  // Tickets buy extra rounds within an existing run; they do not open one.
  const paidEntries = logs.filter((l) => {
    const kind = Number(l.args.kind ?? -1);
    return kind === KIND_ENTRY || kind === KIND_REBUY;
  }).length;

  const opened = await mustQuery<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM weekly_runs
      WHERE week_id = $1 AND player = $2 AND chain = $3`,
    [weekId, player.toLowerCase(), chain]
  );
  const runsOpened = Number(opened.rows[0].n);

  return { paidEntries, runsOpened, canOpen: paidEntries > runsOpened };
}

/** True when payment verification is active. Off means runs are free — staging only. */
export function entryVerificationOn(): boolean {
  return poolAddress() !== null && process.env.V2_REQUIRE_PAID_ENTRY !== "false";
}
