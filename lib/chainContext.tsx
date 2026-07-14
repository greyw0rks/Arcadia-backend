"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { CELO_TOKENS, DEFAULT_CELO_TOKEN, type CeloToken } from "./contract";

interface ChainContextValue {
  chain: "celo";
  token: CeloToken;
  setToken: (t: CeloToken) => void;
}

const ChainContext = createContext<ChainContextValue>({
  chain: "celo",
  token: DEFAULT_CELO_TOKEN,
  setToken: () => {},
});

const TOKEN_STORAGE_KEY = "quizarcade.celoToken";

function isCeloToken(v: unknown): v is CeloToken {
  return typeof v === "string" && v in CELO_TOKENS;
}

export function ChainProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<CeloToken>(() => {
    if (typeof window === "undefined") return DEFAULT_CELO_TOKEN;
    const saved = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    return isCeloToken(saved) ? saved : DEFAULT_CELO_TOKEN;
  });

  const setToken = (t: CeloToken) => {
    setTokenState(t);
    window.localStorage.setItem(TOKEN_STORAGE_KEY, t);
  };

  return (
    <ChainContext.Provider value={{ chain: "celo", token, setToken }}>
      {children}
    </ChainContext.Provider>
  );
}

export function useChain() {
  return useContext(ChainContext);
}
