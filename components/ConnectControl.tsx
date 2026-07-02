"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChain } from "../lib/chainContext";
import { useStacksWallet } from "../lib/stacksWallet";
import { CHAINS, CELO_TOKENS, LOCKED_CHAIN, type ChainId, type CeloToken } from "../lib/contract";

// Chain switcher — only rendered when LOCKED_CHAIN is not set (multi-chain deployments).
export function ChainSwitcher() {
  const { chain, setChain } = useChain();
  const ids = Object.keys(CHAINS) as ChainId[];
  return (
    <div style={{ display: "inline-flex", border: "3px solid #000", background: "#fff" }}>
      {ids.map((id, i) => {
        const active = chain === id;
        return (
          <button
            key={id}
            onClick={() => setChain(id)}
            style={{
              padding: "6px 12px",
              border: "none",
              borderRight: i < ids.length - 1 ? "3px solid #000" : "none",
              background: active ? "#7c5cff" : "#fff",
              color: active ? "#fff" : "#000",
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            aria-pressed={active}
          >
            {CHAINS[id].label}
          </button>
        );
      })}
    </div>
  );
}

// Token picker for Celo — USDM / USDC / USDT. Not shown on Base (USDC only) or Stacks.
export function TokenSwitcher() {
  const { token, setToken } = useChain();
  const ids = Object.keys(CELO_TOKENS) as CeloToken[];
  return (
    <div style={{ display: "inline-flex", border: "3px solid #000", background: "#fff" }}>
      {ids.map((id, i) => {
        const active = token === id;
        return (
          <button
            key={id}
            onClick={() => setToken(id)}
            style={{
              padding: "6px 12px",
              border: "none",
              borderRight: i < ids.length - 1 ? "3px solid #000" : "none",
              background: active ? "#7c5cff" : "#fff",
              color: active ? "#fff" : "#000",
              fontWeight: 800,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            aria-pressed={active}
          >
            {CELO_TOKENS[id].label}
          </button>
        );
      })}
    </div>
  );
}

function StacksConnectButton() {
  const { address, isConnected, connect, disconnect } = useStacksWallet();
  const short = address ? `${address.slice(0, 5)}…${address.slice(-4)}` : "";
  return (
    <button
      onClick={isConnected ? disconnect : connect}
      style={{
        padding: "8px 14px",
        border: "3px solid #000",
        background: isConnected ? "#fff" : "#7c5cff",
        color: isConnected ? "#000" : "#fff",
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {isConnected ? short : "Connect Stacks Wallet"}
    </button>
  );
}

export function ConnectControl() {
  const { chain } = useChain();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {!LOCKED_CHAIN && <ChainSwitcher />}
      {chain === "celo" && <TokenSwitcher />}
      {chain === "stacks" ? (
        <StacksConnectButton />
      ) : (
        <ConnectButton showBalance={false} chainStatus="icon" />
      )}
    </div>
  );
}
