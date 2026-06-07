"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { ChainId } from "./contract";

// Holds the user's selected network (Celo / Stacks), persisted across reloads. The play flow, the
// header switcher, and the connect button all read from here.
interface ChainContextValue {
  chain: ChainId;
  setChain: (c: ChainId) => void;
}

const ChainContext = createContext<ChainContextValue>({
  chain: "celo",
  setChain: () => {},
});

const STORAGE_KEY = "quizarcade.chain";

export function ChainProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<ChainId>("celo");

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "celo" || saved === "stacks") setChainState(saved);
  }, []);

  const setChain = (c: ChainId) => {
    setChainState(c);
    window.localStorage.setItem(STORAGE_KEY, c);
  };

  return <ChainContext.Provider value={{ chain, setChain }}>{children}</ChainContext.Provider>;
}

export function useChain() {
  return useContext(ChainContext);
}
