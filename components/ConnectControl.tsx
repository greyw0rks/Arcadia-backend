"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useConnect, usePublicClient } from "wagmi";
import { injected } from "wagmi/connectors";
import { useChain } from "../lib/chainContext";
import { CELO_TOKENS, celoTokenMeta, type CeloToken } from "../lib/contract";
import { ERC20_ABI } from "../lib/abi";
import { isMiniPay } from "../lib/useArcade";

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

export function ConnectControl() {
  const { connect } = useConnect();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { setToken } = useChain();
  const [inMiniPay, setInMiniPay] = useState(false);

  // Auto-connect on MiniPay and hide the connect button.
  useEffect(() => {
    if (isMiniPay()) {
      setInMiniPay(true);
      connect({ connector: injected() });
    }
  }, [connect]);

  // Once connected on MiniPay, detect the stablecoin with the highest balance and default to it.
  useEffect(() => {
    if (!inMiniPay || !address || !publicClient) return;
    const tokens = Object.keys(CELO_TOKENS) as CeloToken[];
    Promise.all(
      tokens.map(async (t) => {
        const { tokenAddress } = celoTokenMeta(t);
        const bal = (await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
        return { token: t, balance: bal };
      })
    ).then((balances) => {
      const best = balances.reduce((a, b) => (a.balance >= b.balance ? a : b));
      if (best.balance > 0n) setToken(best.token);
    });
  }, [inMiniPay, address, publicClient, setToken]);

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <TokenSwitcher />
      {!inMiniPay && <ConnectButton showBalance={false} chainStatus="icon" />}
    </div>
  );
}
