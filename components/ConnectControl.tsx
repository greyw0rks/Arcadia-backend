"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChain } from "../lib/chainContext";
import { useStacksWallet } from "../lib/stacksWallet";
import { CHAINS, type ChainId } from "../lib/contract";

// Header control: a Celo/Stacks switcher plus the connect button for whichever chain is active.
// RainbowKit handles Celo; Stacks Connect (Leather/Xverse) handles Stacks.
export function ChainSwitcher() {
  const { chain, setChain } = useChain();
  return (
    <div style={{ display: "inline-flex", border: "3px solid #000", background: "#fff" }}>
      {(Object.keys(CHAINS) as ChainId[]).map((id) => {
        const active = chain === id;
        return (
          <button
            key={id}
            onClick={() => setChain(id)}
            style={{
              padding: "6px 12px",
              border: "none",
              borderRight: id === "celo" ? "3px solid #000" : "none",
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
      <ChainSwitcher />
      {chain === "stacks" ? (
        <StacksConnectButton />
      ) : (
        <ConnectButton showBalance={false} chainStatus="icon" />
      )}
    </div>
  );
}
