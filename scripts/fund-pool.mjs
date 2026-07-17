#!/usr/bin/env node
// Fund the live QuizArcade pool with $3 each of USDm / USDC / USDT on Celo mainnet.
//
// For each token it runs: approve(arcade, amount) then fundPool(token, amount).
// fundPool credits the payout pool and emits PoolFunded. (A raw transfer would also work, but this
// gives a clean on-chain event.)
//
// Usage:
//   FUNDER_PRIVATE_KEY=0xabc... node scripts/fund-pool.mjs
//   FUNDER_PRIVATE_KEY=0xabc... AMOUNT=5 node scripts/fund-pool.mjs        # fund $5 each instead
//   FUNDER_PRIVATE_KEY=0xabc... TOKENS=usdc,usdt node scripts/fund-pool.mjs # only some tokens
//
// Gas: pay in CELO (native) or USDm. USDC/USDT are NOT valid feeCurrency without their adapters,
// so keep some CELO in the funder wallet for gas.

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

// ── Config ──────────────────────────────────────────────────────────────────
const ARCADE = getAddress("0xFb2F048B9A088d6Ef0Cf3413B90f4cEf76d0Eb49");
const RPC = process.env.RPC_URL ?? "https://forno.celo.org";
const AMOUNT = process.env.AMOUNT ?? "3"; // dollars per token
const ONLY = (process.env.TOKENS ?? "usdm,usdc,usdt")
  .split(",")
  .map((s) => s.trim().toLowerCase());

const ALL_TOKENS = {
  usdm: { sym: "USDm", addr: "0x765DE816845861e75A25fCA122bb6898B8B1282a", dec: 18 },
  usdc: { sym: "USDC", addr: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", dec: 6 },
  usdt: { sym: "USDT", addr: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", dec: 6 },
};

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
];
const ARCADE_ABI = [
  { type: "function", name: "fundPool", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "tokenEnabled", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "payoutPool", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];

// ── Setup ───────────────────────────────────────────────────────────────────
const pk = process.env.FUNDER_PRIVATE_KEY;
if (!pk) {
  console.error("ERROR: set FUNDER_PRIVATE_KEY (the wallet holding the funds).");
  console.error("Example: FUNDER_PRIVATE_KEY=0x... node scripts/fund-pool.mjs");
  process.exit(1);
}
const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);
const publicClient = createPublicClient({ chain: celo, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: celo, transport: http(RPC) });

async function waitFor(hash, label) {
  process.stdout.write(`   ${label} sent: ${hash}\n   waiting for confirmation... `);
  const rcpt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(rcpt.status === "success" ? "OK" : `FAILED (${rcpt.status})`);
  if (rcpt.status !== "success") throw new Error(`${label} reverted`);
}

async function fundToken(key) {
  const t = ALL_TOKENS[key];
  if (!t) { console.log(`skip unknown token: ${key}`); return; }
  const tokenAddr = getAddress(t.addr);
  const amount = parseUnits(AMOUNT, t.dec);

  console.log(`\n=== ${t.sym}: fund ${AMOUNT} (${amount} base units) ===`);

  const enabled = await publicClient.readContract({ address: ARCADE, abi: ARCADE_ABI, functionName: "tokenEnabled", args: [tokenAddr] });
  if (!enabled) { console.log(`   ${t.sym} is NOT enabled on the contract — skipping.`); return; }

  const bal = await publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [account.address] });
  console.log(`   funder balance: ${formatUnits(bal, t.dec)} ${t.sym}`);
  if (bal < amount) { console.log(`   INSUFFICIENT balance — skipping ${t.sym}.`); return; }

  // approve (skip if allowance already sufficient)
  const allowance = await publicClient.readContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "allowance", args: [account.address, ARCADE] });
  if (allowance < amount) {
    const approveHash = await wallet.writeContract({ address: tokenAddr, abi: ERC20_ABI, functionName: "approve", args: [ARCADE, amount] });
    await waitFor(approveHash, "approve");
  } else {
    console.log("   allowance already sufficient — skipping approve.");
  }

  // fundPool
  const fundHash = await wallet.writeContract({ address: ARCADE, abi: ARCADE_ABI, functionName: "fundPool", args: [tokenAddr, amount] });
  await waitFor(fundHash, "fundPool");

  const pool = await publicClient.readContract({ address: ARCADE, abi: ARCADE_ABI, functionName: "payoutPool", args: [tokenAddr] });
  console.log(`   new payoutPool: ${formatUnits(pool, t.dec)} ${t.sym}`);
}

console.log(`Funder: ${account.address}`);
console.log(`Arcade: ${ARCADE}  (Celo mainnet 42220)`);
console.log(`Tokens: ${ONLY.join(", ")}  |  amount: $${AMOUNT} each`);

for (const key of ONLY) {
  try {
    await fundToken(key);
  } catch (e) {
    console.error(`   ${key} FAILED: ${e.shortMessage || e.message}`);
  }
}
console.log("\nDone.");
