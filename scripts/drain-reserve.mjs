/**
 * drain-reserve.mjs
 * Drains the cUSD payout reserve from the old QuizArcade contract by playing
 * sessions with max-multiplier outcomes (backend is patched to score all correct).
 *
 * Usage:
 *   DRAIN_KEY=0x<private_key>  node scripts/drain-reserve.mjs
 *
 * The wallet at DRAIN_KEY must hold enough cUSD for the first stake (~$0.85).
 * Winnings from each run fund the next one automatically.
 */

import { createPublicClient, createWalletClient, http, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Config ────────────────────────────────────────────────────────────────────

const BACKEND     = "https://arcadia-api-production.up.railway.app";
const ARCADE_ADDR = "0x678Ce8fF913457617EA3d5558c431043faaDD89F";
const CUSD_ADDR   = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const GAME_ID     = "trivia"; // short bank, any game works
const MAX_RUNS    = 10;

const PRIVATE_KEY = process.env.DRAIN_KEY;
if (!PRIVATE_KEY) { console.error("Set DRAIN_KEY env var"); process.exit(1); }

const celoMainnet = {
  id: 42220, name: "Celo",
  nativeCurrency: { name: "Celo", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo.org"] } },
};

const account   = privateKeyToAccount(PRIVATE_KEY);
const publicC   = createPublicClient({ chain: celoMainnet, transport: http() });
const walletC   = createWalletClient({ account, chain: celoMainnet, transport: http() });
const player    = account.address;

const ARCADE_ABI = [
  { name: "startSession",  type: "function", stateMutability: "nonpayable", inputs: [{ name: "sessionId", type: "bytes32" }, { name: "stake", type: "uint256" }, { name: "maxRounds", type: "uint8" }], outputs: [] },
  { name: "settle",        type: "function", stateMutability: "nonpayable", inputs: [{ name: "sessionId", type: "bytes32" }, { name: "multiplierBp", type: "uint256" }, { name: "signature", type: "bytes" }], outputs: [] },
  { name: "freeTreasury",  type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "uint256" }] },
];
const ERC20_ABI = [
  { name: "approve",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  { name: "allowance", type: "function", stateMutability: "view",       inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",       inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const api = async (path, body) => {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { method: "GET" };
  const res = await fetch(`${BACKEND}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(`API ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
};

const fmt = (n, dec = 18) => parseFloat(formatUnits(n, dec)).toFixed(4);

async function ensureAllowance(amount) {
  const current = await publicC.readContract({ address: CUSD_ADDR, abi: ERC20_ABI, functionName: "allowance", args: [player, ARCADE_ADDR] });
  if (current >= amount) return;
  console.log("  Approving cUSD spend…");
  const hash = await walletC.writeContract({ address: CUSD_ADDR, abi: ERC20_ABI, functionName: "approve", args: [ARCADE_ADDR, amount] });
  await publicC.waitForTransactionReceipt({ hash });
  console.log("  Approved ✓");
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function run(runIndex, stakeEth) {
  console.log(`\n── Run ${runIndex}  stake: ${stakeEth} cUSD ─────────────────`);
  const stakeWei = parseUnits(stakeEth.toString(), 18);

  // 1. Create session
  const session = await api("/api/session", { game: GAME_ID, player, chain: "celo", token: "cusd", stake: stakeEth });
  const { sessionId, maxRounds } = session;
  console.log(`  Session ${sessionId.slice(0, 12)}…  maxRounds: ${maxRounds}`);

  // 2. Stake on-chain
  await ensureAllowance(stakeWei * 2n); // approve double so we don't re-approve every run
  console.log("  Calling startSession on-chain…");
  const startHash = await walletC.writeContract({
    address: ARCADE_ADDR, abi: ARCADE_ABI, functionName: "startSession",
    args: [sessionId, stakeWei, maxRounds],
  });
  await publicC.waitForTransactionReceipt({ hash: startHash });
  console.log("  Staked ✓");

  // 3. Answer all rounds (backend is patched → all correct, answer index doesn't matter)
  for (let i = 0; i < maxRounds; i++) {
    await api(`/api/round?sessionId=${sessionId}`);
    const outcome = await api("/api/answer", { sessionId, answerIndex: 0 });
    process.stdout.write(`  Round ${i + 1}/${maxRounds}  ${outcome.result}  ${(outcome.multiplierBp / 10000).toFixed(1)}x\r`);
  }
  console.log();

  // 4. Finalize — get signed settlement
  const { multiplierBp, signature } = await api("/api/finalize", { sessionId });
  console.log(`  Final multiplier: ${(multiplierBp / 10000).toFixed(1)}x`);

  // 5. Settle on-chain
  console.log("  Settling on-chain…");
  const settleHash = await walletC.writeContract({
    address: ARCADE_ADDR, abi: ARCADE_ABI, functionName: "settle",
    args: [sessionId, BigInt(multiplierBp), signature],
  });
  await publicC.waitForTransactionReceipt({ hash: settleHash });
  console.log("  Settled ✓  tx:", settleHash.slice(0, 20) + "…");
}

async function main() {
  const MAX_MULT  = 2.5; // 1x + 15 * 0.1
  const RAKE      = 0.03;

  console.log(`Player: ${player}`);
  const startBal = await publicC.readContract({ address: CUSD_ADDR, abi: ERC20_ABI, functionName: "balanceOf", args: [player] });
  console.log(`Starting cUSD balance: ${fmt(startBal)}`);

  for (let i = 1; i <= MAX_RUNS; i++) {
    const reserve = await publicC.readContract({ address: ARCADE_ADDR, abi: ARCADE_ABI, functionName: "freeTreasury" });
    // freeTreasury shows rake; actual payout pool is contract balance - freeTreasury
    const contractBal = await publicC.readContract({ address: CUSD_ADDR, abi: ERC20_ABI, functionName: "balanceOf", args: [ARCADE_ADDR] });
    const freeTreasury = reserve;
    const payoutPool = contractBal - freeTreasury;

    if (payoutPool <= parseUnits("0.005", 18)) {
      console.log(`\nPayout pool drained (${fmt(payoutPool)} remaining). Done.`);
      break;
    }

    // Max stake we can use without the session reserve exceeding the payout pool
    const maxStakeRaw = Number(formatUnits(payoutPool, 18)) / ((1 - RAKE) * MAX_MULT);
    const stakeEth = Math.min(1.0, Math.max(0.01, Math.floor(maxStakeRaw * 1000) / 1000));

    await run(i, stakeEth);
  }

  const endBal = await publicC.readContract({ address: CUSD_ADDR, abi: ERC20_ABI, functionName: "balanceOf", args: [player] });
  console.log(`\nFinal cUSD balance: ${fmt(endBal)}  (started: ${fmt(startBal)})`);
  console.log(`Net recovered: ${fmt(endBal - startBal)} cUSD`);
}

main().catch(e => { console.error(e); process.exit(1); });
