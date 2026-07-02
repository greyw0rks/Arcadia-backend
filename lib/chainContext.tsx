"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  CELO_TOKENS,
  DEFAULT_CELO_TOKEN,
  LOCKED_CHAIN,
  type ChainId,
  type CeloToken,
} from "./contract";

// Holds the user's selected network (Celo / Base / Stacks) and — when on Celo — the stake token
// (USDM / USDC / USDT), persisted across reloads. The play flow, the header switcher, and the
// connect button all read from here. The token is a Celo sub-dimension that picks which QuizArcade
// instance the session stakes + settles against.
//
// When NEXT_PUBLIC_CHAIN is set, the chain is locked to that value: setChain is a no-op, localStorage
// hydration is skipped, and the chain switcher is hidden in ConnectControl.
interface ChainContextValue {
  chain: ChainId;
  setChain: (c: ChainId) => void;
  token: CeloToken;
  setToken: (t: CeloToken) => void;
}

const lockedChainId: ChainId | undefined =
  LOCKED_CHAIN === "celo" || LOCKED_CHAIN === "base" || LOCKED_CHAIN === "stacks"
    ? LOCKED_CHAIN
    : undefined;

const ChainContext = createContext<ChainContextValue>({
  chain: lockedChainId ?? "celo",
  setChain: () => {},
  token: DEFAULT_CELO_TOKEN,
  setToken: () => {},
});

const STORAGE_KEY = "quizarcade.chain";
const TOKEN_STORAGE_KEY = "quizarcade.celoToken";

function isCeloToken(v: unknown): v is CeloToken {
  return typeof v === "string" && v in CELO_TOKENS;
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<ChainId>(lockedChainId ?? "celo");
  const [token, setTokenState] = useState<CeloToken>(DEFAULT_CELO_TOKEN);

  // Hydrate from localStorage after mount — skipped when the chain is locked by env var.
  useEffect(() => {
    if (lockedChainId) return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "celo" || saved === "base" || saved === "stacks") setChainState(saved);
    const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (isCeloToken(savedToken)) setTokenState(savedToken);
  }, []);

  const setChain = (c: ChainId) => {
    if (lockedChainId) return;
    setChainState(c);
    window.localStorage.setItem(STORAGE_KEY, c);
  };

  const setToken = (t: CeloToken) => {
    // Base only has USDC — no token switching.
    if (lockedChainId === "base") return;
    setTokenState(t);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, t);
  };

  return (
    <ChainContext.Provider value={{ chain, setChain, token, setToken }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  return useContext(ChainContext);
}
