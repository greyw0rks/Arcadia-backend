# @greyw0rks/arcadia

SDK for integrating with **Arcadia** — a multi-chain quiz arcade protocol on Celo (cUSD/USDC/USDT) and Stacks (STX) with EIP-712 settlement.

## Install

```bash
npm install @greyw0rks/arcadia
```

For Stacks support, also install peer dependencies:
```bash
npm install @stacks/transactions @stacks/network
```

---

## Celo

### Sign a settlement (backend)

```ts
import { signEvmSettlement } from "@greyw0rks/arcadia/celo";

const signature = await signEvmSettlement({
  sessionId: "0xabc123...",
  multiplierBp: 15000,       // 1.5x
  token: "cusd",             // "cusd" | "usdc" | "usdt"
  signerPrivateKey: "0x...",
  chainId: 42220,            // Celo mainnet
});
```

### Start a session + settle (player)

```ts
import { createArcadeClient } from "@greyw0rks/arcadia/celo";
import { randomBytes } from "crypto";

const arcade = createArcadeClient({ token: "usdc" });

const sessionId = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;

// Approve token spend
await arcade.approve(playerPrivateKey, BigInt(5_000_000)); // 5 USDC

// Start session
const startHash = await arcade.startSession(
  playerPrivateKey,
  sessionId,
  "1",    // stake in display units ("1" = 1 USDC)
  5       // maxRounds
);

// After backend signs settlement:
const settleHash = await arcade.settle(playerPrivateKey, {
  sessionId,
  multiplierBp: 13000, // 1.3x
  signature,
});
```

### Read contract state

```ts
import { createArcadeReader } from "@greyw0rks/arcadia/celo";

const reader = createArcadeReader({ token: "cusd" });

const free = await reader.freeTreasury();        // bigint wei
const bal  = await reader.tokenBalance(address); // bigint wei
```

### Token registry

```ts
import { CELO_TOKENS_MAINNET, celoTokenMeta } from "@greyw0rks/arcadia";

const meta = celoTokenMeta("usdt");
// { id: "usdt", symbol: "USDT", decimals: 6, arcadeAddress: "0x...", tokenAddress: "0x..." }
```

---

## Stacks

### Sign a settlement (backend)

```ts
import { signStacksSettlement } from "@greyw0rks/arcadia/stacks";

const signature = await signStacksSettlement({
  sessionId: "0xabc123...",
  multiplierBp: 12000,       // 1.2x
  signerPrivateKey: "64hexchars", // no 0x, no trailing 01
});
```

### Build contract call args

```ts
import { buildStartSessionArgs, buildSettleArgs, stacksNetwork } from "@greyw0rks/arcadia/stacks";
import { makeContractCall, broadcastTransaction, AnchorMode } from "@stacks/transactions";

const network = await stacksNetwork("mainnet");

const startArgs = await buildStartSessionArgs({
  sessionId: "0xabc123...",
  stakeUstx: 1_000_000,  // 1 STX
  maxRounds: 5,
});

const tx = await makeContractCall({
  contractAddress: "SP1SY1E599GN04XRD2DQBKV7E62HYBJR2CT9S5QKK",
  contractName: "quiz-arcade",
  functionName: "start-session",
  functionArgs: startArgs,
  senderKey: playerPrivateKey,
  network,
  anchorMode: AnchorMode.Any,
});
```

---

## Utilities

```ts
import { clampMultiplierBp, maxMultiplierBp, computePayout, parseStake } from "@greyw0rks/arcadia";

clampMultiplierBp(20000, 5);   // → 15000 (clamped to BPS + STEP*5)
maxMultiplierBp(5);             // → 15000
computePayout(1000000n, 15000); // → 1500000n
parseStake("1.5", "usdc");     // → 1500000n (6 decimals)
```

---

## Contract addresses (mainnet)

| Token | Arcade Contract | Token Address | Decimals |
|---|---|---|---|
| cUSD | `0x678Ce8fF913457617EA3d5558c431043faaDD89F` | `0x765DE816845861e75A25fCA122bb6898B8B1282a` | 18 |
| USDC | `0x5dF7e848308dB212f5ABeD76d5749ea79668F027` | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` | 6 |
| USDT | `0x3ae4aee0D6e8Fd7f3B038171Dc920034779Ab391` | `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` | 6 |

**Stacks:** `SP1SY1E599GN04XRD2DQBKV7E62HYBJR2CT9S5QKK.quiz-arcade`

---

## License

MIT
