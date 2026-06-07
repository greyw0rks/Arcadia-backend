"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { CELO_TOKENS, DEFAULT_CELO_TOKEN, type ChainId, type CeloToken } from "./contract";

// Holds the user's selected network (Celo / Stacks) and — when on Celo — the stake token
// (cUSD / USDC / USDT), persisted across reloads. The play flow, the header switcher, and the
// connect button all read from here. The token is a Celo sub-dimension that picks which QuizArcade
// instance the session stakes + settles against.
interface ChainContextValue {
  chain: ChainId;
  setChain: (c: ChainId) => void;
  token: CeloToken;
  setToken: (t: CeloToken) => void;
}

const ChainContext = createContext<ChainContextValue>({
  chain: "celo",
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
  const [chain, setChainState] = useState<ChainId>("celo");
  const [token, setTokenState] = useState<CeloToken>(DEFAULT_CELO_TOKEN);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "celo" || saved === "stacks") setChainState(saved);
    const savedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (isCeloToken(savedToken)) setTokenState(savedToken);
  }, []);

  const setChain = (c: ChainId) => {
    setChainState(c);
    window.localStorage.setItem(STORAGE_KEY, c);
  };

  const setToken = (t: CeloToken) => {
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
